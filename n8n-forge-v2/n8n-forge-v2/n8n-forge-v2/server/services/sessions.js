'use strict'
const fs   = require('fs')
const path = require('path')

/**
 * Gestion des sessions de conversation persistantes
 */
class SessionsService {
  constructor(dataDir) {
    this.dir = dataDir
    fs.mkdirSync(dataDir, { recursive: true })
  }

  _file(id) { return path.join(this.dir, `session-${id}.json`) }

  static newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  }

  create(title = 'Nouveau workflow') {
    const session = {
      id:        SessionsService.newId(),
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history:   [],           // [{role, parts:[{text}], ts, workflow?, actions?}]
      workflow:  null,         // dernier workflow généré
      deployed:  []            // workflows déployés dans cette session
    }
    this._write(session)
    return session
  }

  get(id) {
    try {
      return JSON.parse(fs.readFileSync(this._file(id), 'utf8'))
    } catch { return null }
  }

  list() {
    try {
      return fs.readdirSync(this.dir)
        .filter(f => f.startsWith('session-') && f.endsWith('.json'))
        .map(f => {
          try { return JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')) }
          catch { return null }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map(({ id, title, createdAt, updatedAt, deployed }) =>
          ({ id, title, createdAt, updatedAt, msgCount: 0, deployed: deployed?.length || 0 })
        )
    } catch { return [] }
  }

  addMessage(id, role, text, extras = {}) {
    const s = this.get(id)
    if (!s) throw new Error(`Session ${id} introuvable`)
    const msg = { role, parts: [{ text }], ts: new Date().toISOString(), ...extras }
    s.history.push(msg)
    s.updatedAt = new Date().toISOString()
    // Auto-titre depuis le premier message utilisateur
    if (role === 'user' && s.title === 'Nouveau workflow' && text.length > 5) {
      s.title = text.slice(0, 50) + (text.length > 50 ? '…' : '')
    }
    if (extras.workflow) s.workflow = extras.workflow
    if (extras.deployedId) s.deployed.push({ id: extras.deployedId, name: extras.deployedName, ts: msg.ts })
    this._write(s)
    return msg
  }

  update(id, patch) {
    const s = this.get(id)
    if (!s) throw new Error(`Session ${id} introuvable`)
    Object.assign(s, patch, { updatedAt: new Date().toISOString() })
    this._write(s)
    return s
  }

  delete(id) {
    try { fs.unlinkSync(this._file(id)) } catch {}
  }

  _write(s) {
    const tmp = this._file(s.id) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2))
    fs.renameSync(tmp, this._file(s.id))
  }
}

module.exports = SessionsService
