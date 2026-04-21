import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ─── API ─────────────────────────────────────────────────────────────────────
const api = {
  get:    u     => fetch(u).then(r => r.json()),
  post:   (u,b) => fetch(u,{method:'POST',  headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()),
  patch:  (u,b) => fetch(u,{method:'PATCH', headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()),
  delete: u     => fetch(u,{method:'DELETE'}).then(r=>r.json()),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtTime = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60_000)   return 'à l\'instant'
  if (diff < 3600_000) return `il y a ${Math.floor(diff/60_000)}min`
  if (diff < 86400_000)return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
  return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})
}

const nodeIcon = t => {
  const s = (t||'').toLowerCase()
  if(s.includes('trigger')||s.includes('webhook')||s.includes('schedule')) return '⚡'
  if(s.includes('slack'))    return '💬'
  if(s.includes('telegram')) return '✈️'
  if(s.includes('gmail')||s.includes('email')) return '📧'
  if(s.includes('google'))   return '🔵'
  if(s.includes('github'))   return '🐙'
  if(s.includes('postgres')||s.includes('mysql')||s.includes('database')) return '🗄️'
  if(s.includes('openai')||s.includes('gemini')||s.includes('agent')||s.includes('langchain')) return '🤖'
  if(s.includes('http'))     return '🌐'
  if(s.includes('code'))     return '⚙️'
  if(s.includes('if')||s.includes('switch')||s.includes('merge')) return '🔀'
  return '🔷'
}

// ─── Markdown simple ──────────────────────────────────────────────────────────
function Md({ text }) {
  const html = useMemo(() => {
    let t = (text||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      // code blocks
      .replace(/```json\n?([\s\S]*?)\n?```/g, (_,c) =>
        `<pre><code class="lang-json">${c}</code></pre>`)
      .replace(/```([\s\S]*?)```/g, (_,c) =>
        `<pre><code>${c}</code></pre>`)
      // inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // actions tags (masqués)
      .replace(/\[(DEPLOY|VALIDATE|TEST|SHOW_WORKFLOWS)\]/g, '')
      // headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm,  '<h3>$1</h3>')
      // lists
      .replace(/^- (.+)$/gm,  '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      // paragraphs
      .split('\n\n').map(p => {
        if(p.startsWith('<')) return p
        return `<p>${p.replace(/\n/g,'<br>')}</p>`
      }).join('')
    return t
  }, [text])
  return <div dangerouslySetInnerHTML={{__html: html}}/>
}

// ─── Workflow Card ─────────────────────────────────────────────────────────────
function WorkflowCard({ workflow, onDeploy, onValidate, sessionId, n8nUrl }) {
  const [deployed, setDeployed] = useState(false)
  const [loading,  setLoading]  = useState(false)

  const handleDeploy = async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/workflows/deploy', { workflow, sessionId, activate: true })
      if (res.id) { setDeployed(true); onDeploy?.(res) }
    } catch {}
    setLoading(false)
  }

  return (
    <div className="wf-card">
      <div className="wf-card-header">
        <span style={{fontSize:16}}>⚡</span>
        <span className="wf-card-title">{workflow.name}</span>
        <span className="wf-card-meta">{workflow.nodes?.length||0} nodes</span>
        {deployed && <span className="badge badge-green">✓ Déployé</span>}
      </div>
      <div className="wf-card-nodes">
        {(workflow.nodes||[]).slice(0,6).map((n,i)=>(
          <span key={i} className="node-chip">
            {nodeIcon(n.type)} {n.name}
          </span>
        ))}
        {(workflow.nodes?.length||0)>6 &&
          <span className="node-chip">+{workflow.nodes.length-6}</span>}
      </div>
      <div className="wf-card-actions">
        {!deployed && (
          <button className="btn btn-primary btn-sm" onClick={handleDeploy} disabled={loading}>
            {loading ? '⏳' : '🚀'} {loading ? 'Déploiement…' : 'Déployer'}
          </button>
        )}
        {deployed && n8nUrl && (
          <a href={`${n8nUrl}/workflows`} target="_blank" rel="noreferrer"
            className="btn btn-outline btn-sm">
            ↗ Ouvrir dans N8N
          </a>
        )}
        <button className="btn btn-outline btn-sm" onClick={()=>onValidate?.(workflow)}>
          ✓ Valider
        </button>
      </div>
    </div>
  )
}

// ─── Message ──────────────────────────────────────────────────────────────────
function Message({ msg, sessionId, n8nUrl, onDeploy, onValidate }) {
  const isUser  = msg.role === 'user'
  const isForge = msg.role === 'model'
  const text    = msg.parts?.[0]?.text || ''

  return (
    <div className={`msg-row ${isUser?'user':'forge'}`}>
      <div className={`msg-avatar ${isUser?'user':'forge'}`}>
        {isUser ? '👤' : 'F'}
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div className="msg-bubble">
          <Md text={text}/>
          {msg.workflow && (
            <WorkflowCard
              workflow={msg.workflow}
              sessionId={sessionId}
              n8nUrl={n8nUrl}
              onDeploy={onDeploy}
              onValidate={onValidate}
            />
          )}
          {msg.deployedId && (
            <div style={{marginTop:8}}>
              <span className="badge badge-green">
                ✓ Workflow déployé · ID: {msg.deployedId}
              </span>
            </div>
          )}
        </div>
        <div className="msg-ts">{fmtTime(msg.ts)}</div>
      </div>
    </div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function Typing() {
  return (
    <div className="msg-row forge">
      <div className="msg-avatar forge">F</div>
      <div className="msg-bubble" style={{background:'var(--bg)',border:'1px solid var(--border2)'}}>
        <div className="typing">
          <span/><span/><span/>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([])
  const add = useCallback((msg, type='') => {
    const id = Date.now()
    setToasts(t => [...t, {id,msg,type}])
    setTimeout(() => setToasts(t => t.filter(x=>x.id!==id)), 3500)
  }, [])
  return { toasts, add }
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [config,      setConfig]    = useState(null)
  const [sessions,    setSessions]  = useState([])
  const [activeId,    setActiveId]  = useState(null)
  const [session,     setSession]   = useState(null)  // session complète avec history
  const [workflows,   setWorkflows] = useState([])
  const [showWfPanel, setShowWfPanel] = useState(false)
  const [input,       setInput]     = useState('')
  const [typing,      setTyping]    = useState(false)
  const [mcpOk,       setMcpOk]     = useState(null)

  const bottomRef  = useRef()
  const textareaRef = useRef()
  const { toasts, add: toast } = useToasts()

  const SUGGESTIONS = [
    'Crée un workflow qui envoie un résumé RSS par email chaque matin',
    'Webhook → valide payload → notifie Telegram',
    'Agent qui classe les intentions et appelle le bon sous-workflow',
    'Scraping API météo toutes les heures → stockage MySQL',
  ]

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/api/config').then(setConfig).catch(()=>{})
    api.get('/api/health').then(h => setMcpOk(h.mcpConnected)).catch(()=>setMcpOk(false))
    loadSessions()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [session?.history, typing])

  // ── Sessions ──────────────────────────────────────────────────────────────
  const loadSessions = async () => {
    const data = await api.get('/api/sessions').catch(()=>[])
    setSessions(data)
    return data
  }

  const openSession = async id => {
    setActiveId(id)
    const s = await api.get(`/api/sessions/${id}`)
    setSession(s)
  }

  const newSession = async (firstMsg = '') => {
    const s = await api.post('/api/sessions', { title: firstMsg || 'Nouveau workflow' })
    await loadSessions()
    setActiveId(s.id)
    setSession(s)
    return s
  }

  const deleteSession = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Supprimer cette conversation ?')) return
    await api.delete(`/api/sessions/${id}`)
    if (activeId === id) { setActiveId(null); setSession(null) }
    loadSessions()
  }

  // ── Load workflows ────────────────────────────────────────────────────────
  const loadWorkflows = useCallback(async () => {
    const data = await api.get('/api/workflows').catch(()=>[])
    setWorkflows(Array.isArray(data) ? data : (data.data||[]))
  }, [])

  useEffect(() => { if (showWfPanel) loadWorkflows() }, [showWfPanel])

  // ── Envoyer message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg) return
    setInput('')
    textareaRef.current?.focus()

    let sid = activeId
    if (!sid) {
      const s = await newSession(msg)
      sid = s.id
    }

    // Ajouter localement le message utilisateur
    setSession(s => ({
      ...s,
      history: [...(s?.history||[]), {
        role: 'user',
        parts: [{ text: msg }],
        ts: new Date().toISOString()
      }]
    }))

    setTyping(true)
    try {
      const res = await api.post(`/api/sessions/${sid}/chat`, { message: msg })
      if (res.error) throw new Error(res.error)

      // Recharger la session complète depuis le serveur
      const updated = await api.get(`/api/sessions/${sid}`)
      setSession(updated)
      setSessions(prev => {
        const idx = prev.findIndex(s=>s.id===sid)
        if(idx<0) return prev
        const copy = [...prev]
        copy[idx] = { ...copy[idx], title: updated.title, updatedAt: updated.updatedAt }
        return copy
      })

      if (res.deployedId) {
        toast(`✓ Workflow déployé (ID: ${res.deployedId})`, 'success')
        loadWorkflows()
      }
    } catch (e) {
      toast(`Erreur : ${e.message}`, 'error')
      setSession(s => ({
        ...s,
        history: [...(s?.history||[]), {
          role: 'model',
          parts: [{ text: `❌ Erreur : ${e.message}` }],
          ts: new Date().toISOString()
        }]
      }))
    }
    setTyping(false)
  }, [input, activeId])

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Toggle workflow ───────────────────────────────────────────────────────
  const toggleWf = async (wf) => {
    const action = wf.active ? 'deactivate' : 'activate'
    await api.post(`/api/workflows/${wf.id}/${action}`, {})
    loadWorkflows()
    toast(`${wf.active?'⏸':'▶'} ${wf.name}`)
  }

  const deleteWf = async (wf) => {
    if (!window.confirm(`Supprimer "${wf.name}" ?`)) return
    await api.delete(`/api/workflows/${wf.id}`)
    loadWorkflows()
    toast(`🗑 ${wf.name} supprimé`)
  }

  const n8nUrl = config?.n8nPublicUrl || ''

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">N8N·FORGE</span>
          </div>
        </div>

        <button className="new-chat-btn" onClick={() => {
          setActiveId(null); setSession(null)
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          Nouveau workflow
        </button>

        <div className="session-list">
          {sessions.length === 0 && (
            <div style={{padding:'12px 16px',fontSize:13,color:'var(--text3)'}}>
              Aucune conversation
            </div>
          )}
          {sessions.map(s => (
            <div key={s.id}
              className={`session-item ${activeId===s.id?'active':''}`}
              onClick={() => openSession(s.id)}>
              <div className="session-avatar">
                {activeId===s.id ? '⚡' : '💬'}
              </div>
              <div className="session-info">
                <div className="session-name">{s.title}</div>
                <div className="session-meta">{fmtTime(s.updatedAt)}</div>
              </div>
              <button className="session-del"
                onClick={e => deleteSession(e, s.id)}
                title="Supprimer">×</button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className={`status-dot ${mcpOk===true?'ok':mcpOk===false?'error':''}`}/>
          <span>{mcpOk===true ? 'MCP · N8N connectés' : mcpOk===false ? 'MCP déconnecté' : 'Connexion…'}</span>
          <button className="icon-btn" style={{marginLeft:'auto',width:28,height:28,fontSize:14}}
            onClick={() => { setShowWfPanel(v=>!v) }} title="Workflows">
            📋
          </button>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <div className="main">
        {/* Header */}
        <div className="conv-header">
          <div className="conv-title">
            {session ? session.title : 'N8N·FORGE — Agentic Workflow IDE'}
          </div>
          <div className="conv-actions">
            {session && n8nUrl && (
              <a href={n8nUrl} target="_blank" rel="noreferrer" className="icon-btn" title="Ouvrir N8N">
                ↗
              </a>
            )}
            <button className="icon-btn" title="Workflows N8N"
              onClick={() => { setShowWfPanel(v=>!v); if(!showWfPanel) loadWorkflows() }}>
              📋
            </button>
          </div>
        </div>

        <div className="main-content">
          {/* Conversation */}
          <div className="conv-area">
            <div className="messages">
              {/* Empty state */}
              {!session && (
                <div className="empty-state">
                  <div className="empty-icon">⚡</div>
                  <div className="empty-title">N8N·FORGE</div>
                  <div className="empty-sub">
                    Décris ton workflow en langage naturel.<br/>
                    Je génère, valide et déploie dans N8N.
                  </div>
                  <div className="suggestions">
                    {SUGGESTIONS.map((s,i) => (
                      <div key={i} className="suggestion-chip"
                        onClick={() => sendMessage(s)}>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {(session?.history||[]).map((msg, i) => (
                <Message
                  key={i}
                  msg={msg}
                  sessionId={activeId}
                  n8nUrl={n8nUrl}
                  onDeploy={() => { loadWorkflows(); toast('✓ Déployé !','success') }}
                  onValidate={async wf => {
                    const res = await api.post('/api/workflows/validate', { workflow: wf })
                    toast(res.valid ? '✓ Workflow valide' : `⚠ ${res.errors?.length} erreurs`, res.valid?'success':'error')
                  }}
                />
              ))}

              {typing && <Typing/>}
              <div ref={bottomRef}/>
            </div>

            {/* Input */}
            <div className="input-area">
              <div className="input-box">
                <textarea
                  ref={textareaRef}
                  className="input-field"
                  placeholder="Décris ton workflow… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"
                  value={input}
                  onChange={e => {
                    setInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
                  }}
                  onKeyDown={handleKey}
                  rows={1}
                />
                <button className="send-btn" onClick={() => sendMessage()}
                  disabled={!input.trim() || typing}>
                  {typing ? '⏳' : '➤'}
                </button>
              </div>
              <div className="input-hint">
                {config?.geminiConfigured ? 'Propulsé par Gemini 2.5 + N8N MCP' : '⚠ GEMINI_API_KEY manquante'}
              </div>
            </div>
          </div>

          {/* Workflows panel */}
          {showWfPanel && (
            <div className="wf-panel">
              <div className="wf-panel-header">
                <span className="wf-panel-title">Workflows N8N ({workflows.length})</span>
                <div style={{display:'flex',gap:4}}>
                  <button className="icon-btn" style={{width:28,height:28,fontSize:13}} onClick={loadWorkflows}>↻</button>
                  <button className="icon-btn" style={{width:28,height:28,fontSize:16}} onClick={()=>setShowWfPanel(false)}>×</button>
                </div>
              </div>
              <div className="wf-list">
                {workflows.length===0 && (
                  <div style={{padding:'16px',fontSize:13,color:'var(--text3)',textAlign:'center'}}>
                    Aucun workflow
                  </div>
                )}
                {workflows.map(wf => (
                  <div key={wf.id} className="wf-item">
                    <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                      background: wf.active ? 'var(--green)' : 'var(--border)'}}>
                    </div>
                    <span className="wf-item-name" title={wf.name}>{wf.name}</span>
                    <div className="wf-item-actions">
                      <button className="icon-btn" style={{width:24,height:24,fontSize:12}}
                        onClick={() => toggleWf(wf)}
                        title={wf.active?'Désactiver':'Activer'}>
                        {wf.active ? '⏸' : '▶'}
                      </button>
                      <button className="icon-btn" style={{width:24,height:24,fontSize:12,color:'var(--red)'}}
                        onClick={() => deleteWf(wf)} title="Supprimer">
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  )
}
