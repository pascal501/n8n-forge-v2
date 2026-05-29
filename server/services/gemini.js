'use strict'
const fetch = require('node-fetch')

const FORGE_SYSTEM = `Tu es N8N·FORGE, un assistant expert en automatisation N8N.
Tu aides l'utilisateur à concevoir, générer et déployer des workflows N8N.

TON RÔLE :
- Comprendre les besoins en langage naturel (français ou anglais)
- Poser des questions de clarification si nécessaire
- Générer des workflows N8N valides et déployables
- Guider le déploiement et le debug

NODES DISPONIBLES (format: "Nom affiché" → type à utiliser dans le JSON) :
{nodeList}

WORKFLOWS EXISTANTS : {workflowList}

═══════════════════════════════════════════════════════════
FORMAT JSON OBLIGATOIRE — RESPECTER SCRUPULEUSEMENT
═══════════════════════════════════════════════════════════

RÈGLES CRITIQUES :
1. Le champ "type" de chaque node DOIT utiliser le workflowNodeType exact (ex: "n8n-nodes-base.httpRequest")
2. Ne JAMAIS utiliser "n8n-nodes-base.function" → utiliser "n8n-nodes-base.code" à la place
3. Le format des connections est STRICT — voir exemple ci-dessous
4. Ne jamais mettre de credential ID fictif (ex: "YOUR_GMAIL_CREDENTIAL_ID") — omettre le champ "credentials" si inconnu

FORMAT CONNECTIONS (OBLIGATOIRE) :
\`\`\`
"connections": {
  "Nom du node source": {
    "main": [
      [
        { "node": "Nom du node cible", "type": "main", "index": 0 }
      ]
    ]
  }
}
\`\`\`

EXEMPLE DE WORKFLOW VALIDE :
\`\`\`json
{
  "name": "Exemple Webhook → HTTP → Email",
  "nodes": [
    {
      "parameters": { "path": "mon-webhook", "responseMode": "onReceived" },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 300]
    },
    {
      "parameters": { "url": "https://api.exemple.com/data", "method": "GET", "options": {} },
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [460, 300]
    },
    {
      "parameters": {
        "fromEmail": "bot@exemple.com",
        "toEmail": "user@exemple.com",
        "subject": "Résultat",
        "text": "={{ $json.body }}"
      },
      "name": "Send Email",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [680, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "HTTP Request", "type": "main", "index": 0 }]]
    },
    "HTTP Request": {
      "main": [[{ "node": "Send Email", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": {}
}
\`\`\`

RÈGLE OBLIGATOIRE — ID UNIQUE PAR NODE :
Chaque node DOIT avoir un champ "id" avec un UUID v4 unique, ex:
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
Génère un UUID différent pour chaque node. Sans "id", le workflow est invalide.

VERSIONS ET TYPES DES NODES COURANTS :
- Planification  : n8n-nodes-base.scheduleTrigger  → typeVersion: 1, params: rule.interval[{field:"cronExpression",expression:"0 8 * * *"}]
- RSS            : n8n-nodes-base.rssFeedRead       → typeVersion: 1, params: url
- Code/Script    : n8n-nodes-base.code              → typeVersion: 2, params: jsCode (JAMAIS functionCode)
- Gmail          : n8n-nodes-base.gmail             → typeVersion: 2, params OBLIGATOIRES: { "operation": "send", "sendTo": "...", "subject": "...", "message": "..." }
- Email simple   : n8n-nodes-base.emailSend         → typeVersion: 2
- HTTP Request   : n8n-nodes-base.httpRequest       → typeVersion: 4
- Webhook        : n8n-nodes-base.webhook           → typeVersion: 2
- IF/Condition   : n8n-nodes-base.if                → typeVersion: 2
- Set/Assign     : n8n-nodes-base.set               → typeVersion: 3

═══════════════════════════════════════════════════════════

RÉPONSE FORMAT :
- Réponds toujours en français
- Sois concis et direct
- Si tu génères un workflow, inclus le JSON dans un seul bloc \`\`\`json
- Si tu poses des questions, limite-toi à 2 questions max
- Indique clairement quand le workflow est prêt à déployer

ACTIONS DISPONIBLES (réponds avec ces tags quand approprié) :
- [DEPLOY] pour déployer le workflow généré
- [VALIDATE] pour valider avant déploiement
- [TEST] pour tester un workflow existant
- [SHOW_WORKFLOWS] pour lister les workflows`

class GeminiService {
  constructor(apiKey, model = 'gemini-2.5-flash-preview-04-17', fetcher = fetch) {
    if (!apiKey) throw new Error('GEMINI_API_KEY manquante')
    this.apiKey  = apiKey
    this.model   = model
    this.fetch   = fetcher
  }

  /**
   * Conversation multi-tours avec contexte
   * @param {Array} history  [{role:'user'|'model', parts:[{text}]}]
   * @param {string} message Message de l'utilisateur
   * @param {object} context Contexte injecté (nodes, workflows)
   */
  async chat(history, message, context = {}) {
    // Limiter à 150 nodes pour ne pas dépasser les limites de tokens Gemini
    const nodes = (Array.isArray(context.nodes) ? context.nodes : []).slice(0, 150)
    const nodeList = nodes
      .map(n => `"${n.displayName || n.name}" → ${n.workflowNodeType || n.name}`)
      .join('\n') || 'Non chargés'

    const workflowList = (Array.isArray(context.workflows) ? context.workflows : [])
      .map(w => `${w.name} (${w.id})`).join(', ') || 'Aucun'

    const systemPrompt = FORGE_SYSTEM
      .replace('{nodeList}',     nodeList)
      .replace('{workflowList}', workflowList)

    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] }
    ]

    const body = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig:  { temperature: 0.3, maxOutputTokens: 8192 }
    })

    console.log('[Gemini] model:', this.model, '| key length:', this.apiKey?.length, '| body size:', body.length, 'bytes | history:', contents.length - 1, 'msgs')

    const res = await this.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )

    if (!res.ok) {
      const t = await res.text()
      let detail = t.slice(0, 400)
      try { detail = JSON.parse(t)?.error?.message || detail } catch {}
      console.error('[Gemini] ERREUR', res.status, detail)
      throw new Error(`Gemini ${res.status}: ${detail}`)
    }

    const data = await res.json()
    if (!data.candidates?.length) {
      const reason = data.promptFeedback?.blockReason || 'réponse vide'
      throw new Error(`Gemini : pas de réponse (${reason})`)
    }
    const text = data.candidates[0]?.content?.parts?.[0]?.text || ''
    return { text, role: 'model' }
  }

  /**
   * Extrait le JSON workflow d'une réponse texte
   */
  static extractWorkflowJson(text) {
    const match = text.match(/```json\n?([\s\S]*?)\n?```/)
    if (!match) return null
    try {
      const wf = JSON.parse(match[1])
      if (!wf.name || !Array.isArray(wf.nodes)) return null
      return wf
    } catch { return null }
  }

  /**
   * Détecte les actions dans la réponse
   */
  static detectActions(text) {
    return {
      deploy:   text.includes('[DEPLOY]'),
      validate: text.includes('[VALIDATE]'),
      test:     text.includes('[TEST]'),
      showWf:   text.includes('[SHOW_WORKFLOWS]'),
    }
  }
}

module.exports = GeminiService
