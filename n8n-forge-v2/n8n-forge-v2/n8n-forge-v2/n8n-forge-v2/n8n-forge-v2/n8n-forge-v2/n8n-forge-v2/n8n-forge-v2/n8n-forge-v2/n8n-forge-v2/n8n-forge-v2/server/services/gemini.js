'use strict'
const fetch = require('node-fetch')

const FORGE_SYSTEM = `Tu es N8N·FORGE, un assistant expert en automatisation N8N.
Tu aides l'utilisateur à concevoir, générer et déployer des workflows N8N.

TON RÔLE :
- Comprendre les besoins en langage naturel (français ou anglais)
- Poser des questions de clarification si nécessaire
- Proposer une architecture modulaire (orchestrateur + tools + sous-workflows)
- Générer des workflows N8N valides
- Guider le déploiement et le debug

PRINCIPES :
- Pattern "deterministic first, agent second" : router les cas simples sans LLM
- Un tool = une capacité stateless
- Un sous-workflow = une tâche métier autonome
- Logging structuré (sessionId, duration, status)

NODES DISPONIBLES : {nodeList}

WORKFLOWS EXISTANTS : {workflowList}

RÉPONSE FORMAT :
- Réponds toujours en français
- Sois concis et direct
- Si tu génères un workflow, inclus le JSON dans un bloc \`\`\`json
- Si tu poses des questions, limite-toi à 2-3 questions max
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
    const systemPrompt = FORGE_SYSTEM
      .replace('{nodeList}',    context.nodes?.map(n => n.name).join(', ') || 'Non chargés')
      .replace('{workflowList}', context.workflows?.map(w => `${w.name} (${w.id})`).join(', ') || 'Aucun')

    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] }
    ]

    const res = await this.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig:  { temperature: 0.3, maxOutputTokens: 4096 }
        })
      }
    )

    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`)
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
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
