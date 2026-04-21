'use strict'
require('dotenv').config()

const express        = require('express')
const cors           = require('cors')
const path           = require('path')
const fs             = require('fs')
const os             = require('os')

const McpClient      = require('./services/mcp')
const GeminiService  = require('./services/gemini')
const SessionsService = require('./services/sessions')

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))
app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, '../dist')))

// ─── Config ───────────────────────────────────────────────────────────────────
const MCP_URL      = (process.env.MCP_BASE_URL   || 'http://localhost:3000').replace(/\/$/, '')
const MCP_TOKEN    = process.env.MCP_AUTH_TOKEN   || ''
const GEMINI_KEY   = process.env.GEMINI_API_KEY   || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL     || 'gemini-2.5-flash-preview-04-17'
const N8N_PUB_URL  = (process.env.N8N_PUBLIC_URL  || 'http://localhost:5678').replace(/\/$/, '')
const DATA_DIR     = path.join(__dirname, '../data/sessions')

// ─── Services ─────────────────────────────────────────────────────────────────
const mcp      = new McpClient({ baseUrl: MCP_URL, authToken: MCP_TOKEN })
const sessions = new SessionsService(DATA_DIR)

// Cache nodes/workflows (5 min)
const cache = { nodes: null, workflows: null, ts: 0 }
const TTL   = 5 * 60_000

async function getContext() {
  if (cache.nodes && Date.now() - cache.ts < TTL) {
    return { nodes: cache.nodes, workflows: cache.workflows }
  }
  try {
    // Nodes via MCP search_nodes (retourne tous les nodes connus)
    const nodesRaw = await mcp.searchNodes('webhook http code schedule email slack telegram postgres mysql google gemini openai', 50)
    let nodes = []
    try { nodes = JSON.parse(nodesRaw) } catch { nodes = [] }

    // Workflows via MCP
    const wfResult = await mcp.listWorkflows(100)
    const wfText   = wfResult?.content?.[0]?.text || '[]'
    let workflows  = []
    try { workflows = JSON.parse(wfText) } catch { workflows = [] }
    if (workflows.data) workflows = workflows.data

    cache.nodes     = nodes
    cache.workflows = workflows
    cache.ts        = Date.now()
    return { nodes, workflows }
  } catch (e) {
    console.warn('[context] Erreur chargement:', e.message)
    return { nodes: [], workflows: [] }
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  let mcpOk = false
  try {
    await mcp.initialize()
    mcpOk = true
  } catch {}
  res.json({
    status:           'ok',
    mcpUrl:           MCP_URL,
    mcpConnected:     mcpOk,
    geminiConfigured: !!GEMINI_KEY,
    n8nPublicUrl:     N8N_PUB_URL
  })
})

app.get('/api/config', (_req, res) => res.json({
  n8nPublicUrl:     N8N_PUB_URL,
  geminiConfigured: !!GEMINI_KEY,
  mcpConfigured:    !!MCP_TOKEN
}))

// ─── Context (nodes + workflows) ──────────────────────────────────────────────
app.get('/api/context', async (_req, res) => {
  try {
    const ctx = await getContext()
    res.json(ctx)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Sessions ─────────────────────────────────────────────────────────────────
app.get('/api/sessions', (_req, res) => res.json(sessions.list()))

app.post('/api/sessions', (req, res) => {
  const s = sessions.create(req.body.title)
  res.status(201).json(s)
})

app.get('/api/sessions/:id', (req, res) => {
  const s = sessions.get(req.params.id)
  s ? res.json(s) : res.status(404).json({ error: 'Session introuvable' })
})

app.delete('/api/sessions/:id', (req, res) => {
  sessions.delete(req.params.id)
  res.json({ ok: true })
})

app.patch('/api/sessions/:id', (req, res) => {
  try {
    const s = sessions.update(req.params.id, req.body)
    res.json(s)
  } catch (e) { res.status(404).json({ error: e.message }) }
})

// ─── Chat (cœur de l'application) ────────────────────────────────────────────
app.post('/api/sessions/:id/chat', async (req, res) => {
  const { message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'message requis' })
  if (!GEMINI_KEY)      return res.status(503).json({ error: 'GEMINI_API_KEY manquante' })

  const session = sessions.get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session introuvable' })

  // Enregistrer le message utilisateur
  sessions.addMessage(req.params.id, 'user', message)

  try {
    const ctx = await getContext()

    // Historique pour Gemini (sans les extras)
    const history = session.history.map(m => ({
      role:  m.role,
      parts: m.parts
    }))

    // Appel Gemini
    const gemini   = new GeminiService(GEMINI_KEY, GEMINI_MODEL)
    const response = await gemini.chat(history, message, ctx)

    // Extraire workflow JSON si présent
    const workflow = GeminiService.extractWorkflowJson(response.text)
    const actions  = GeminiService.detectActions(response.text)

    // Auto-déploiement si [DEPLOY] détecté et workflow présent
    let deployedId   = null
    let deployedName = null
    if (actions.deploy && workflow) {
      try {
        const result  = await mcp.createWorkflow(workflow.name, workflow.nodes, workflow.connections)
        const content = result?.content?.[0]?.text || '{}'
        const data    = JSON.parse(content)
        deployedId    = data.id
        deployedName  = workflow.name
        cache.ts      = 0 // Invalider le cache workflows
      } catch (e) {
        console.warn('[deploy] Erreur auto-déploiement:', e.message)
      }
    }

    // Enregistrer la réponse
    const msg = sessions.addMessage(req.params.id, 'model', response.text, {
      workflow,
      actions,
      deployedId,
      deployedName
    })

    res.json({ message: msg, workflow, actions, deployedId })
  } catch (e) {
    const errMsg = `Erreur : ${e.message}`
    sessions.addMessage(req.params.id, 'model', errMsg)
    res.status(500).json({ error: e.message })
  }
})

// ─── Actions directes MCP ─────────────────────────────────────────────────────

// Déployer un workflow
app.post('/api/workflows/deploy', async (req, res) => {
  const { workflow, sessionId, activate = true } = req.body
  if (!workflow) return res.status(400).json({ error: 'workflow requis' })
  try {
    const result  = await mcp.createWorkflow(workflow.name, workflow.nodes, workflow.connections)
    const content = result?.content?.[0]?.text || '{}'
    const data    = JSON.parse(content)
    if (activate && data.id) {
      await mcp.activateWorkflow(data.id)
    }
    if (sessionId && data.id) {
      sessions.addMessage(sessionId, 'model',
        `✓ Workflow **${workflow.name}** déployé avec succès (ID: ${data.id})`,
        { deployedId: data.id, deployedName: workflow.name }
      )
    }
    cache.ts = 0
    res.json({ id: data.id, name: workflow.name })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Valider un workflow
app.post('/api/workflows/validate', async (req, res) => {
  try {
    const result  = await mcp.validateWorkflow(req.body.workflow)
    const content = result?.content?.[0]?.text || '{}'
    res.json(JSON.parse(content))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Lister les workflows
app.get('/api/workflows', async (_req, res) => {
  try {
    const result  = await mcp.listWorkflows(100)
    const content = result?.content?.[0]?.text || '[]'
    const data    = JSON.parse(content)
    res.json(Array.isArray(data) ? data : (data.data || []))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Activer/désactiver
app.post('/api/workflows/:id/activate',   async (req, res) => {
  try { await mcp.activateWorkflow(req.params.id); cache.ts=0; res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/workflows/:id/deactivate', async (req, res) => {
  try { await mcp.deactivateWorkflow(req.params.id); cache.ts=0; res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// Supprimer
app.delete('/api/workflows/:id', async (req, res) => {
  try { await mcp.deleteWorkflow(req.params.id); cache.ts=0; res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// Exécutions
app.get('/api/workflows/:id/executions', async (req, res) => {
  try {
    const result  = await mcp.listExecutions(req.params.id, 20)
    const content = result?.content?.[0]?.text || '[]'
    res.json(JSON.parse(content))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Tester
app.post('/api/workflows/:id/test', async (req, res) => {
  try {
    const result  = await mcp.testWorkflow(req.params.id, req.body)
    const content = result?.content?.[0]?.text || '{}'
    res.json(JSON.parse(content))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Autofix
app.post('/api/workflows/:id/autofix', async (req, res) => {
  try {
    const result  = await mcp.autofixWorkflow(req.params.id, true)
    const content = result?.content?.[0]?.text || '{}'
    res.json(JSON.parse(content))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  const idx = path.join(__dirname, '../dist/index.html')
  fs.existsSync(idx)
    ? res.sendFile(idx)
    : res.status(503).send('Frontend non buildé — npm run build')
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  N8N·FORGE v2 → http://localhost:${PORT}`)
  console.log(`  MCP           : ${MCP_URL}  ${MCP_TOKEN ? '✓' : '⚠ TOKEN MANQUANT'}`)
  console.log(`  Gemini        : ${GEMINI_MODEL}  ${GEMINI_KEY ? '✓' : '⚠ CLÉ MANQUANTE'}`)
  console.log(`  N8N public    : ${N8N_PUB_URL}\n`)
})
