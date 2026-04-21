'use strict'
const fetch = require('node-fetch')

/**
 * Client MCP pour n8n-mcp
 * Gère la session MCP et expose les outils comme méthodes
 */
class McpClient {
  constructor({ baseUrl, authToken, timeout = 30_000 }, fetcher = fetch) {
    this.base      = baseUrl.replace(/\/$/, '')
    this.token     = authToken
    this.timeout   = timeout
    this.fetch     = fetcher
    this.sessionId = null
    this._msgId    = 1
  }

  _headers(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'Accept':        'application/json, text/event-stream',
      'Authorization': `Bearer ${this.token}`,
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...extra
    }
  }

  async _post(body) {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeout)
    try {
      const res = await this.fetch(`${this.base}/mcp`, {
        method:  'POST',
        headers: this._headers(),
        body:    JSON.stringify({ ...body, jsonrpc: '2.0', id: this._msgId++ }),
        signal:  ctrl.signal
      })

      // Capturer le session ID si présent
      const sid = res.headers.get('mcp-session-id')
      if (sid) this.sessionId = sid

      const text = await res.text()
      // Réponse SSE : "event: message\ndata: {...}"
      const dataLine = text.split('\n').find(l => l.startsWith('data:'))
      if (dataLine) {
        const json = JSON.parse(dataLine.replace('data:', '').trim())
        if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
        return json.result
      }
      // Réponse JSON directe
      const json = JSON.parse(text)
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
      return json.result
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`MCP timeout (>${this.timeout}ms)`)
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  /** Initialise la session MCP */
  async initialize() {
    const result = await this._post({
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'n8n-forge', version: '2.0' }
      }
    })
    return result
  }

  /** Appelle un outil MCP */
  async callTool(name, args = {}) {
    if (!this.sessionId) await this.initialize()
    return this._post({
      method: 'tools/call',
      params: { name, arguments: args }
    })
  }

  /** Liste les outils disponibles */
  async listTools() {
    if (!this.sessionId) await this.initialize()
    return this._post({ method: 'tools/list', params: {} })
  }

  // ── Raccourcis sémantiques ──────────────────────────────────────────────────

  async searchNodes(query, limit = 20) {
    const r = await this.callTool('search_nodes', { query, limit, includeOperations: false })
    return r?.content?.[0]?.text || '[]'
  }

  async createWorkflow(name, nodes, connections, settings = {}) {
    return this.callTool('n8n_create_workflow', { name, nodes, connections, settings })
  }

  async listWorkflows(limit = 100) {
    return this.callTool('n8n_list_workflows', { limit })
  }

  async getWorkflow(id) {
    return this.callTool('n8n_get_workflow', { id, mode: 'full' })
  }

  async updateWorkflow(id, operations) {
    return this.callTool('n8n_update_partial_workflow', { id, operations })
  }

  async deleteWorkflow(id) {
    return this.callTool('n8n_delete_workflow', { id })
  }

  async activateWorkflow(id) {
    return this.callTool('n8n_update_partial_workflow', {
      id, operations: [{ type: 'activateWorkflow' }]
    })
  }

  async deactivateWorkflow(id) {
    return this.callTool('n8n_update_partial_workflow', {
      id, operations: [{ type: 'deactivateWorkflow' }]
    })
  }

  async validateWorkflow(workflow) {
    return this.callTool('validate_workflow', { workflow })
  }

  async autofixWorkflow(id, applyFixes = true) {
    return this.callTool('n8n_autofix_workflow', { id, applyFixes })
  }

  async generateWorkflow(description) {
    return this.callTool('n8n_generate_workflow', { description })
  }

  async testWorkflow(workflowId, data = {}) {
    return this.callTool('n8n_test_workflow', { workflowId, data })
  }

  async listExecutions(workflowId, limit = 30) {
    return this.callTool('n8n_executions', {
      action: 'list', workflowId, limit
    })
  }

  async getExecution(id) {
    return this.callTool('n8n_executions', { action: 'get', id, mode: 'summary' })
  }

  async health() {
    return this.callTool('n8n_health_check', { mode: 'status' })
  }

  async searchTemplates(query) {
    return this.callTool('search_templates', { searchMode: 'keyword', query, limit: 10 })
  }
}

module.exports = McpClient
