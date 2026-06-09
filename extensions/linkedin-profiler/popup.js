// =============================================================
// popup.js — Contrôleur du popup unifié
//
// Modes :
//   - Profil (/in/*) : scrape → LLM → PDF → Airtable
//   - Entreprise (/company/*) : scrape → LLM → liaison contacts → PDF
//   - Feed (/feed/*, /posts/*) : scan posts → capture
//   - Batch : enrichissement automatique de N contacts
//
// Config chargée depuis chrome.storage.sync (Options page).
// =============================================================

'use strict';

let _tab      = null;
let _recordId = null;
let _pageType = null; // 'profile' | 'company' | 'feed' | 'post'

// =============================================================
// ─── INITIALISATION ──────────────────────────────────────────
// =============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  _tab = tab;

  // Boutons
  document.getElementById('btnImport').addEventListener('click', startImport);
  document.getElementById('btnAirtable').addEventListener('click', openAirtable);
  document.getElementById('btnOpenOptions')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('btnBatch')?.addEventListener('click', showBatchConfig);
  document.getElementById('btnBatchFromWrong')?.addEventListener('click', showBatchConfig);
  document.getElementById('btnBatchStart')?.addEventListener('click', startBatchWithCount);
  document.getElementById('btnBatchCancel')?.addEventListener('click', () => {
    document.getElementById('batchConfig').classList.remove('show');
    if (_pageType) document.getElementById('mainPanel').style.display = 'block';
    else {
      document.getElementById('noLi').style.display = 'block';
    }
  });
  document.querySelectorAll('.batch-quick-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.getElementById('batchCountInput').value = e.target.getAttribute('data-count');
    });
  });
  document.getElementById('batchCountInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startBatchWithCount();
  });

  // Sélecteur de cible (LCM / Clients)
  document.getElementById('btnTargetLcm')?.addEventListener('click', async () => {
    setActiveTarget('lcm');
    // Recharger le popup pour appliquer la nouvelle cible
    window.location.reload();
  });
  document.getElementById('btnTargetClients')?.addEventListener('click', async () => {
    setActiveTarget('clients');
    window.location.reload();
  });

  // Si un batch tourne déjà, vérifier
  chrome.runtime.sendMessage({ action: 'getBatchStatus' }, (status) => {
    if (chrome.runtime.lastError) return;
    if (status?.running) {
      // Rediriger vers la fenêtre batch-monitor
      const monitorUrl = chrome.runtime.getURL('batch-monitor.html');
      chrome.windows.create({ url: monitorUrl, type: 'popup', width: 700, height: 900 });
    }
  });

  // Initialiser le sélecteur de cible (toujours visible)
  const savedTarget = await new Promise((r) =>
    chrome.storage.sync.get('activeTarget', (d) => r(d.activeTarget || 'lcm'))
  );
  updateTargetButtons(savedTarget);

  // Vérifier la config
  const config = await loadConfig();
  if (!config) {
    document.getElementById('noLi').style.display = 'none';
    document.getElementById('noConfig').style.display = 'block';
    return;
  }

  // Détection du type de page
  const isProfile = tab.url && /linkedin\.com\/in\//i.test(tab.url);
  const isCompany = tab.url && /linkedin\.com\/company\//i.test(tab.url);
  const isFeed    = tab.url && (/linkedin\.com\/feed/i.test(tab.url) || /linkedin\.com\/posts\//i.test(tab.url));

  if (!isProfile && !isCompany && !isFeed) return; // noLi visible par défaut

  _pageType = isCompany ? 'company' : isFeed ? 'feed' : 'profile';

  document.getElementById('noLi').style.display    = 'none';
  document.getElementById('mainPanel').style.display = 'block';
  updateUIForPageType(_pageType);

  // Vérifier que le content script répond
  try {
    const ping = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    if (ping?.pageType) {
      _pageType = ping.pageType;
      updateUIForPageType(_pageType);
    }

    // Feed : comptage des posts
    if (_pageType === 'feed' || _pageType === 'post') {
      await refreshFeedCount();
      return;
    }

    // Feature A : doublon
    await checkExistingRecord(tab.url);

    // Feature B : contacts connus (company)
    if (_pageType === 'company') {
      await loadKnownContacts(tab.url);
    }

  } catch (_) {
    setStatus('⚠️', 'Rechargez la page LinkedIn puis réessayez.');
    document.getElementById('btnImport').disabled = true;
  }
});

// =============================================================
// ─── CONFIG ──────────────────────────────────────────────────
// =============================================================

const ALL_CONFIG_KEYS = [
  'airtableToken', 'geminiKey', 'openrouterKey', 'batchDelay', 'batchMax',
  'activeTarget',
  'lcm_baseId', 'lcm_contactsTableId', 'lcm_companiesTableId', 'lcm_jobsTableId',
  'clients_baseId', 'clients_contactsTableId', 'clients_companiesTableId',
];

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(ALL_CONFIG_KEYS, (raw) => {
      if (!raw.airtableToken) { resolve(null); return; }

      const target = raw.activeTarget || 'lcm';
      let baseId, tableId, companyTableId;
      if (target === 'clients') {
        baseId         = raw.clients_baseId;
        tableId        = raw.clients_contactsTableId;
        companyTableId = raw.clients_companiesTableId;
      } else {
        baseId         = raw.lcm_baseId;
        tableId        = raw.lcm_contactsTableId;
        companyTableId = raw.lcm_companiesTableId;
      }

      if (!baseId || !tableId) { resolve(null); return; }

      resolve({
        airtableToken: raw.airtableToken,
        geminiKey:     raw.geminiKey || '',
        openrouterKey: raw.openrouterKey || '',
        batchDelay:    raw.batchDelay || 45,
        batchMax:      raw.batchMax || 50,
        activeTarget:  target,
        baseId,
        tableId,
        companyTableId: companyTableId || '',
        jobsTableId:   raw.lcm_jobsTableId || '',
        jobsBaseId:    raw.lcm_baseId || '',
        raw,
      });
    });
  });
}

function setActiveTarget(target) {
  chrome.storage.sync.set({ activeTarget: target });
  updateTargetButtons(target);
}

function updateTargetButtons(target) {
  const btnLcm     = document.getElementById('btnTargetLcm');
  const btnClients = document.getElementById('btnTargetClients');
  btnLcm.className     = 'target-btn' + (target === 'lcm' ? ' active-lcm' : '');
  btnClients.className = 'target-btn' + (target === 'clients' ? ' active-clients' : '');
}

// =============================================================
// ─── UI DYNAMIQUE ────────────────────────────────────────────
// =============================================================

function updateUIForPageType(type) {
  if (type === 'company') {
    document.getElementById('btnImport').textContent   = '🏢 Importer cette entreprise';
    document.getElementById('s1Label').textContent      = 'Lecture de la page entreprise';
    document.getElementById('s2Label').textContent      = 'Structuration IA + Airtable';
    document.getElementById('s3Label').textContent      = 'Liaison des contacts salariés';
    document.getElementById('s4Label').textContent      = 'Génération PDF + Upload';
    document.getElementById('statusTxt').textContent    = 'Prêt à importer cette entreprise';
    document.getElementById('s1').querySelector('.step-ic').textContent = '🏢';
  } else if (type === 'feed' || type === 'post') {
    document.getElementById('btnImport').textContent   = '📋 Capturer les posts détectés';
    document.getElementById('s1Label').textContent      = 'Scan du fil en cours…';
    document.getElementById('s2Label').textContent      = 'Analyse IA (catégorie + technologies)';
    document.getElementById('s3Label').textContent      = 'Liaison entreprise Airtable';
    document.getElementById('s4Label').textContent      = 'Enregistrement dans Offres emploi';
    document.getElementById('statusTxt').textContent    = 'Scan du fil LinkedIn';
    document.getElementById('s1').querySelector('.step-ic').textContent = '📡';
  } else {
    document.getElementById('btnImport').textContent   = '📥 Importer ce profil';
    document.getElementById('s1Label').textContent      = 'Lecture du profil LinkedIn';
    document.getElementById('s2Label').textContent      = 'Structuration Gemini AI';
    document.getElementById('s3Label').textContent      = 'Génération du PDF';
    document.getElementById('s4Label').textContent      = 'Envoi vers Airtable';
    document.getElementById('statusTxt').textContent    = 'Prêt à importer ce profil';
    document.getElementById('s1').querySelector('.step-ic').textContent = '📄';
  }
}

// =============================================================
// ─── FEED — COMPTAGE ─────────────────────────────────────────
// =============================================================

async function refreshFeedCount({ isRetry = false } = {}) {
  try {
    const resp = await chrome.tabs.sendMessage(_tab.id, { type: 'GET_POST_COUNT' });
    const total    = resp?.count    || 0;
    const inRegion = resp?.inRegion || 0;

    if (total === 0) {
      if (!isRetry) {
        setStatus('🔍', 'Scan en cours… résultat dans 2 secondes.');
        document.getElementById('btnImport').disabled = true;
        setTimeout(() => refreshFeedCount({ isRetry: true }), 2000);
      } else {
        setStatus('🔍', 'Aucun post de recrutement détecté.\nFais défiler ton fil pour en charger davantage.');
        document.getElementById('btnImport').disabled = true;
      }
    } else {
      const regionTxt = inRegion > 0 ? ` dont ${inRegion} en Bretagne/Pays de la Loire` : '';
      setStatus('💼', `${total} post${total > 1 ? 's' : ''} de recrutement détecté${total > 1 ? 's' : ''}${regionTxt}.`);
      document.getElementById('btnImport').textContent = `📋 Capturer les ${total} posts`;
      document.getElementById('btnImport').disabled = false;
    }
  } catch (_) {
    setStatus('⚠️', 'Rechargez la page et réessayez.');
  }
}

// =============================================================
// ─── FEATURE A — DOUBLON ─────────────────────────────────────
// =============================================================

async function checkExistingRecord(tabUrl) {
  if (!tabUrl) return;
  const type = _pageType === 'company' ? 'company' : 'profile';

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'CHECK_EXISTING',
      linkedinUrl: tabUrl,
      entityType: _pageType === 'company' ? 'company' : 'profile',
    });

    if (!result?.exists) {
      setStatus('🆕', type === 'company' ? 'Nouvelle entreprise — prête à importer.' : 'Nouveau contact — prêt à importer.');
      return;
    }

    const lastUpdateTxt = result.lastUpdate
      ? ` — mis à jour le ${new Date(result.lastUpdate).toLocaleDateString('fr-FR')}`
      : '';
    const label = result.name ? `"${result.name}"` : 'Ce record';
    setStatus('✅', `${label} est déjà dans Airtable${lastUpdateTxt}.`);

    // Lien Airtable
    const statusEl = document.getElementById('statusTxt');
    if (statusEl && result.airtableUrl) {
      const link     = document.createElement('a');
      link.href      = result.airtableUrl;
      link.target    = '_blank';
      link.rel       = 'noopener';
      link.textContent = '↗ Voir la fiche Airtable';
      link.style.cssText = 'display:block;margin-top:4px;font-size:11px;color:#0a66c2;text-decoration:underline;cursor:pointer;';
      statusEl.parentNode.insertBefore(link, statusEl.nextSibling);
    }

    // Bouton « Mettre à jour »
    const btn = document.getElementById('btnImport');
    btn.textContent = type === 'company' ? '🔄 Mettre à jour cette entreprise' : '🔄 Mettre à jour ce contact';
    btn.style.background = '#057642';

    // Features D+E (company)
    if (type === 'company' && result.recordId) {
      showStatusWidget(result.recordId, result.status);
      showRelancePicker(result.recordId);
    }

  } catch (_) { /* silencieux */ }
}

// =============================================================
// ─── FEATURE D — STATUT PROSPECTION ─────────────────────────
// =============================================================

const PROSPECT_STATUSES = [
  { label: '🆕 Nouveau',      value: '🆕 Nouveau' },
  { label: '🔍 À qualifier',  value: '🔍 À qualifier' },
  { label: '📞 À contacter',  value: '📞 À contacter' },
  { label: '🤝 RDV pris',     value: '🤝 RDV pris' },
  { label: '❄️ En veille',    value: '❄️ En veille' },
  { label: '🚫 Exclu',        value: '🚫 Exclu (client Shodo)' },
];

function showStatusWidget(recordId, currentStatus) {
  const mainPanel = document.getElementById('mainPanel');
  if (!mainPanel || document.getElementById('statusWidget')) return;

  const section = document.createElement('div');
  section.id = 'statusWidget';
  section.style.cssText = 'margin-top:10px;padding:10px 12px;background:#f8f9fa;border-radius:8px;border:1px solid #e0e0e0;';

  const title = document.createElement('div');
  title.textContent = 'Statut prospection';
  title.style.cssText = 'font-size:11px;font-weight:600;color:#444;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;';
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';

  PROSPECT_STATUSES.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    const isActive = value === currentStatus;
    btn.style.cssText = [
      'padding:4px 6px', 'border-radius:6px', 'font-size:10.5px', 'cursor:pointer',
      'border:1.5px solid', isActive ? '#0a66c2' : '#d0d0d0',
      'background:' + (isActive ? '#e8f0fe' : '#fff'),
      'color:' + (isActive ? '#0a66c2' : '#333'),
      'font-weight:' + (isActive ? '600' : '400'),
      'text-align:left', 'transition:all .15s',
    ].join(';');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.style.opacity = '0.6';
      try {
        await chrome.runtime.sendMessage({ type: 'UPDATE_PROSPECT_STATUS', recordId, status: value });
        grid.querySelectorAll('button').forEach((b) => {
          b.style.border = '1.5px solid #d0d0d0'; b.style.background = '#fff';
          b.style.color = '#333'; b.style.fontWeight = '400';
          b.disabled = false; b.style.opacity = '1';
        });
        btn.style.border = '1.5px solid #0a66c2'; btn.style.background = '#e8f0fe';
        btn.style.color = '#0a66c2'; btn.style.fontWeight = '600'; btn.style.opacity = '1';
      } catch (_) {
        btn.disabled = false; btn.style.opacity = '1';
      }
    });
    grid.appendChild(btn);
  });

  section.appendChild(grid);
  const knownContacts = document.getElementById('knownContactsSection');
  if (knownContacts) mainPanel.insertBefore(section, knownContacts);
  else mainPanel.appendChild(section);
}

// =============================================================
// ─── FEATURE E — RELANCE ────────────────────────────────────
// =============================================================

function showRelancePicker(recordId) {
  const mainPanel = document.getElementById('mainPanel');
  if (!mainPanel || document.getElementById('relanceWidget')) return;

  const section = document.createElement('div');
  section.id = 'relanceWidget';
  section.style.cssText = 'margin-top:8px;padding:10px 12px;background:#fff8e1;border-radius:8px;border:1px solid #ffe082;';

  const title = document.createElement('div');
  title.textContent = '⏰ Programmer une relance';
  title.style.cssText = 'font-size:11px;font-weight:600;color:#795548;margin-bottom:6px;';
  section.appendChild(title);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  let activeBtn = null;
  [{ label: '+3j', days: 3 }, { label: '+5j', days: 5 }, { label: '+1 sem', days: 7 }, { label: '+2 sem', days: 14 }]
    .forEach(({ label, days }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'padding:4px 10px;border-radius:14px;font-size:10.5px;border:1.5px solid #ffe082;background:#fff;color:#795548;cursor:pointer;transition:all .15s;';
      btn.addEventListener('click', async () => {
        if (activeBtn) { activeBtn.style.background = '#fff'; activeBtn.style.border = '1.5px solid #ffe082'; activeBtn.style.color = '#795548'; }
        btn.style.background = '#ff8f00'; btn.style.border = '1.5px solid #ff8f00'; btn.style.color = '#fff';
        activeBtn = btn; btn.disabled = true;
        try {
          const r = await chrome.runtime.sendMessage({ type: 'SET_RELANCE', recordId, daysAhead: days });
          const dateStr = r?.dateRelance ? new Date(r.dateRelance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
          title.textContent = `⏰ Relance programmée${dateStr ? ' le ' + dateStr : ''} ✓`;
          title.style.color = '#2e7d32';
        } catch (_) { btn.style.background = '#fff'; btn.disabled = false; }
      });
      row.appendChild(btn);
    });

  section.appendChild(row);
  mainPanel.appendChild(section);
}

// =============================================================
// ─── FEATURE B — CONTACTS CONNUS ─────────────────────────────
// =============================================================

async function loadKnownContacts(tabUrl) {
  if (!tabUrl || _pageType !== 'company') return;

  const slugMatch = tabUrl.match(/linkedin\.com\/company\/([^/?#]+)/i);
  const slug = slugMatch ? decodeURIComponent(slugMatch[1]).replace(/-/g, ' ') : null;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'GET_COMPANY_CONTACTS',
      companyName: slug,
      linkedinUrl: tabUrl,
    });

    const contacts = result?.contacts || [];
    if (contacts.length === 0) return;

    const mainPanel = document.getElementById('mainPanel');
    if (!mainPanel) return;

    const section = document.createElement('div');
    section.id = 'knownContactsSection';
    section.style.cssText = 'margin-top:12px;padding:10px 12px;background:#f0f7f4;border-radius:8px;border-left:3px solid #057642;';

    const title = document.createElement('div');
    title.textContent = `👥 ${contacts.length} contact${contacts.length > 1 ? 's' : ''} connu${contacts.length > 1 ? 's' : ''}`;
    title.style.cssText = 'font-weight:600;font-size:12px;color:#057642;margin-bottom:6px;';
    section.appendChild(title);

    contacts.slice(0, 5).forEach((c) => {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:11px;margin:2px 0;display:flex;align-items:center;gap:6px;';
      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      if (c.linkedinUrl) {
        const a = document.createElement('a');
        a.href = c.linkedinUrl; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = c.name;
        a.style.cssText = 'color:#0a66c2;text-decoration:none;font-weight:500;';
        nameEl.appendChild(a);
      } else {
        nameEl.textContent = c.name;
      }
      row.appendChild(nameEl);
      if (c.poste) {
        const posteEl = document.createElement('span');
        posteEl.textContent = c.poste;
        posteEl.style.cssText = 'color:#666;font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;';
        row.appendChild(posteEl);
      }
      section.appendChild(row);
    });

    if (contacts.length > 5) {
      const more = document.createElement('div');
      more.textContent = `…et ${contacts.length - 5} autre${contacts.length - 5 > 1 ? 's' : ''}`;
      more.style.cssText = 'font-size:10px;color:#888;margin-top:4px;';
      section.appendChild(more);
    }

    const stepsEl = document.getElementById('steps');
    if (stepsEl) mainPanel.insertBefore(section, stepsEl);
    else mainPanel.appendChild(section);

  } catch (_) { /* silencieux */ }
}

// =============================================================
// ─── DISPATCH PRINCIPAL ──────────────────────────────────────
// =============================================================

async function startImport() {
  if (_pageType === 'company')                      return startCompanyImport();
  if (_pageType === 'feed' || _pageType === 'post') return startFeedCapture();
  return startProfileImport();
}

// =============================================================
// ─── FLUX PROFIL ─────────────────────────────────────────────
// =============================================================

async function startProfileImport() {
  const btn = document.getElementById('btnImport');
  btn.disabled = true;
  document.getElementById('successBox').classList.remove('show');
  document.getElementById('btnAirtable').style.display = 'none';

  try {
    step('s1', 'active');
    setStatus('⏳', 'Lecture du profil (scroll + Coordonnées)…');

    let scr;
    try {
      scr = await chrome.tabs.sendMessage(_tab.id, { type: 'SCRAPE_PROFILE' });
    } catch {
      throw new Error('Impossible de lire la page. Rechargez LinkedIn.');
    }
    if (!scr?.success) throw new Error(scr?.error || 'Erreur de lecture.');

    const { rawText, contactInfo, linkedinUrl, photoUrl, name, companyProfileUrl, mutualConnections, experiences } = scr.data;
    document.getElementById('preview').classList.add('show');
    document.getElementById('previewName').textContent = name || 'Profil LinkedIn';
    document.getElementById('previewTitle').textContent = linkedinUrl;
    step('s1', 'done');

    step('s2', 'active');
    setStatus('🤖', 'Structuration IA + Airtable…');
    const processed = await chrome.runtime.sendMessage({
      type: 'PROCESS_PROFILE', rawText, contactInfo, linkedinUrl, photoUrl, companyProfileUrl, mutualConnections, experiences,
    });
    if (!processed?.success) throw new Error(processed?.error || 'Erreur IA/Airtable.');
    const { structuredData, recordId, isUpdate, photoDataUrl } = processed;
    _recordId = recordId;
    step('s2', 'done');

    step('s3', 'active');
    setStatus('📋', 'Génération du PDF structuré…');
    const pdfBase64 = buildContactPDF(structuredData, photoDataUrl);
    step('s3', 'done');

    step('s4', 'active');
    setStatus('🗄️', 'Envoi du PDF vers Airtable…');
    const pdfName = (structuredData.nom || structuredData.nom_complet || 'profil').replace(/[^a-zA-Z0-9àâäéèêëïîôùûüç_-]/gi, '_');
    await chrome.runtime.sendMessage({ type: 'UPLOAD_PDF', recordId, pdfBase64, pdfName });
    step('s4', 'done');

    setStatus('✅', 'Terminé !');
    document.getElementById('successTitle').textContent = isUpdate ? '✅ Contact mis à jour !' : '✅ Nouveau contact créé !';
    document.getElementById('successSub').textContent = structuredData.nom_complet || name || '';
    document.getElementById('successBox').classList.add('show');
    document.getElementById('btnAirtable').style.display = 'block';
    btn.textContent = '🔄 Réimporter';
    btn.disabled = false;

  } catch (err) {
    setStatus('❌', `Erreur : ${err.message}`);
    ['s1','s2','s3','s4'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('done')) step(id, 'error');
    });
    btn.textContent = '🔄 Réessayer';
    btn.disabled = false;
  }
}

// =============================================================
// ─── FLUX ENTREPRISE ─────────────────────────────────────────
// =============================================================

async function startCompanyImport() {
  const btn = document.getElementById('btnImport');
  btn.disabled = true;
  document.getElementById('successBox').classList.remove('show');
  document.getElementById('btnAirtable').style.display = 'none';

  try {
    step('s1', 'active');
    setStatus('⏳', 'Lecture de la page entreprise…');

    let scr;
    try {
      scr = await chrome.tabs.sendMessage(_tab.id, { type: 'SCRAPE_COMPANY' });
    } catch {
      throw new Error('Impossible de lire la page. Rechargez LinkedIn.');
    }
    if (!scr?.success) throw new Error(scr?.error || 'Erreur de lecture.');

    const { rawText, linkedinUrl, logoUrl, companyName } = scr.data;
    document.getElementById('preview').classList.add('show');
    document.getElementById('previewName').textContent = companyName || 'Entreprise';
    document.getElementById('previewTitle').textContent = linkedinUrl;
    step('s1', 'done');

    step('s2', 'active');
    setStatus('🤖', 'Structuration IA + envoi vers Airtable…');
    const processed = await chrome.runtime.sendMessage({
      type: 'PROCESS_COMPANY', rawText, linkedinUrl, logoUrl, companyName,
    });
    if (!processed?.success) throw new Error(processed?.error || 'Erreur IA/Airtable.');
    const { structuredData, recordId, isUpdate, logoDataUrl, linkedContactsCount } = processed;
    _recordId = recordId;
    step('s2', 'done');

    step('s3', 'active');
    setStatus('🔗', linkedContactsCount > 0
      ? `${linkedContactsCount} contact(s) salarié(s) lié(s) !`
      : 'Aucun contact salarié trouvé.');
    step('s3', 'done');

    step('s4', 'active');
    setStatus('📋', 'Génération du PDF entreprise…');
    const pdfBase64 = buildCompanyPDF(structuredData, logoDataUrl);
    await chrome.runtime.sendMessage({ type: 'UPLOAD_COMPANY_PDF', recordId, pdfBase64 });
    step('s4', 'done');

    setStatus('✅', 'Terminé !');
    document.getElementById('successTitle').textContent = isUpdate ? '✅ Entreprise mise à jour !' : '✅ Nouvelle entreprise créée !';
    document.getElementById('successSub').textContent = `${structuredData.nom || companyName || ''}` +
      (linkedContactsCount > 0 ? ` · ${linkedContactsCount} contact(s) lié(s)` : '');
    document.getElementById('successBox').classList.add('show');
    document.getElementById('btnAirtable').style.display = 'block';
    btn.textContent = '🔄 Réimporter';
    btn.disabled = false;

    if (_recordId) {
      showStatusWidget(_recordId, isUpdate ? null : '🆕 Nouveau');
      showRelancePicker(_recordId);
    }

  } catch (err) {
    setStatus('❌', `Erreur : ${err.message}`);
    ['s1','s2','s3','s4'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('done')) step(id, 'error');
    });
    btn.textContent = '🔄 Réessayer';
    btn.disabled = false;
  }
}

// =============================================================
// ─── FLUX FEED ───────────────────────────────────────────────
// =============================================================

async function startFeedCapture() {
  const btn = document.getElementById('btnImport');
  btn.disabled = true;
  document.getElementById('successBox').classList.remove('show');

  try {
    step('s1', 'active');
    setStatus('📡', 'Récupération des posts…');

    let countResp;
    try {
      countResp = await chrome.tabs.sendMessage(_tab.id, { type: 'GET_POST_COUNT' });
    } catch {
      throw new Error('Impossible de communiquer avec la page.');
    }
    if (!countResp?.count) {
      step('s1', 'done');
      setStatus('🔍', 'Aucun post à capturer.');
      btn.disabled = false;
      return;
    }
    step('s1', 'done');

    step('s2', 'active');
    setStatus('🤖', `Analyse IA de ${countResp.count} post${countResp.count > 1 ? 's' : ''}…`);
    const captureResp = await new Promise((resolve) => {
      chrome.tabs.sendMessage(_tab.id, { type: 'CAPTURE_ALL_POSTS' }, resolve);
    });
    step('s2', 'done');
    step('s3', 'done');
    step('s4', 'done');

    const captured = captureResp?.captured || 0;
    document.getElementById('successBox').classList.add('show');
    document.getElementById('successTitle').textContent = `✅ ${captured} post${captured > 1 ? 's' : ''} capturé${captured > 1 ? 's' : ''}`;
    document.getElementById('successSub').textContent = 'Enregistrés dans Offres emploi';
    setStatus('✅', `${captured} offre${captured > 1 ? 's' : ''} enregistrée${captured > 1 ? 's' : ''}.`);
    document.getElementById('btnAirtable').style.display = 'block';

  } catch (err) {
    setStatus('❌', err.message);
    ['s1','s2','s3','s4'].forEach((id) => step(id, 'error'));
    btn.disabled = false;
  }
}

// =============================================================
// ─── MODE BATCH ──────────────────────────────────────────────
// =============================================================

async function showBatchConfig() {
  const config = await loadConfig();
  if (!config) {
    chrome.runtime.openOptionsPage();
    return;
  }

  document.getElementById('noLi').style.display = 'none';
  document.getElementById('mainPanel').style.display = 'none';
  document.getElementById('batchConfig').classList.add('show');

  const input = document.getElementById('batchCountInput');
  if (input) input.value = parseInt(config.batchMax, 10) || 50;
}

async function startBatchWithCount() {
  const config = await loadConfig();
  if (!config) return;

  const countInput = document.getElementById('batchCountInput');
  let count = parseInt(countInput.value, 10) || 50;
  count = Math.min(300, Math.max(1, count));
  chrome.storage.sync.set({ batchMax: count });

  // Ouvre la fenêtre de monitoring
  const monitorUrl = chrome.runtime.getURL('batch-monitor.html');
  chrome.windows.create(
    { url: monitorUrl, type: 'popup', width: 700, height: 900, left: 100, top: 100 },
    () => {
      chrome.runtime.sendMessage({
        action: 'startBatch',
        config: {
          token: config.airtableToken,
          baseId: config.baseId,
          tableId: config.tableId,
          companyTableId: config.companyTableId || '',
          geminiKey: config.geminiKey || '',
          openrouterKey: config.openrouterKey || '',
          batchDelay: parseInt(config.batchDelay, 10) || 45,
          maxCount: count,
          activeTarget: config.activeTarget,
        },
      }).catch(() => {});
    }
  );
}

// =============================================================
// ─── PDF — PROFIL ────────────────────────────────────────────
// =============================================================

function buildContactPDF(data, photoDataUrl) {
  const BLUE  = [10, 102, 194];
  const DARK  = [25, 25, 25];
  const GRAY  = [100, 100, 100];
  const WHITE = [255, 255, 255];
  const LGRAY = [230, 230, 230];

  const pdf = new PDFBuilder();
  pdf.addPage();

  const hdrH = 52;
  const photoSize = 48;
  const hasPhoto = !!photoDataUrl;
  const textX = hasPhoto ? pdf.M + photoSize + 10 : pdf.M;

  pdf.filledRect(0, pdf.H - hdrH, pdf.W, hdrH, BLUE);

  // Photo de profil dans le header (si disponible)
  if (hasPhoto) {
    const photoY = pdf.H - hdrH + (hdrH - photoSize) / 2;
    pdf.addJpegImage(photoDataUrl, pdf.M, photoY, photoSize, photoSize);
  }

  const nom = data.nom_complet || `${data.prenom || ''} ${data.nom || ''}`.trim() || 'Profil LinkedIn';
  pdf.curY = pdf.H - 18;
  pdf.text(nom, textX, pdf.curY, 20, WHITE, true);
  pdf.down(9);
  if (data.titre) { pdf.text(String(data.titre).substring(0, 90), textX, pdf.curY, 10, [200, 225, 255]); pdf.down(7); }
  if (data.entreprise_actuelle) { pdf.text(`Entreprise : ${data.entreprise_actuelle}`, textX, pdf.curY, 9, [180, 210, 255]); pdf.down(6); }
  pdf.curY = pdf.H - hdrH - 10;

  // Coordonnées — labels texte (les emojis ne sont pas supportés en Latin-1/Helvetica)
  const coords = [
    data.localisation && `Lieu : ${data.localisation}`,
    data.email        && `Email : ${data.email}`,
    data.telephone    && `Tel : ${data.telephone}`,
    data.site_web     && `Web : ${data.site_web}`,
    data.linkedin_url && `LinkedIn : ${data.linkedin_url}`,
  ].filter(Boolean);
  if (coords.length) {
    const rowH = 12, boxH = coords.length * rowH + 10;
    pdf.filledRect(pdf.M - 4, pdf.curY - boxH + 8, pdf.W - pdf.M * 2 + 8, boxH, [245, 248, 252]);
    coords.forEach((c) => { pdf.text(c, pdf.M, pdf.curY, 8.5, DARK); pdf.down(rowH); });
    pdf.down(6);
  }

  const section = (title) => {
    pdf.checkPage(30);
    pdf.down(8);
    pdf.text(title, pdf.M, pdf.curY, 11, BLUE, true);
    pdf.down(5);
    pdf.hline(BLUE);
    pdf.down(4);
  };

  if (data.resume) { section('A PROPOS'); pdf.wrappedText(data.resume, pdf.M, pdf.curW, 9, DARK, false, 12); pdf.down(6); }
  if (data.experiences?.length) {
    section('EXPERIENCES PROFESSIONNELLES');
    data.experiences.forEach((e, idx) => {
      pdf.checkPage(30);
      pdf.text(e.poste || '', pdf.M, pdf.curY, 10, DARK, true);
      pdf.down(14);
      let sub = e.entreprise || ''; if (e.periode) sub += ` - ${e.periode}`;
      if (sub) { pdf.text(sub, pdf.M, pdf.curY, 9, BLUE); pdf.down(13); }
      // Détail complet uniquement pour les 2 expériences les plus récentes
      if (idx < 2 && e.description) { pdf.wrappedText(e.description, pdf.M + 6, pdf.curW - 6, 8.5, GRAY, false, 11.5); }
      pdf.down(8);
    });
  }
  if (data.formations?.length) {
    section('FORMATIONS');
    data.formations.forEach((f) => {
      pdf.checkPage(20);
      pdf.text(f.etablissement || '', pdf.M, pdf.curY, 10, DARK, true);
      pdf.down(14);
      let sub = f.diplome || ''; if (f.periode) sub += (sub ? ' - ' : '') + f.periode;
      if (sub) { pdf.text(sub, pdf.M, pdf.curY, 9, GRAY); pdf.down(13); }
      pdf.down(6);
    });
  }
  if (data.competences?.length) { section('COMPETENCES'); pdf.wrappedText(data.competences.join(' - '), pdf.M, pdf.curW, 9, DARK, false, 12); pdf.down(6); }
  if (data.langues?.length) { section('LANGUES'); pdf.text(data.langues.join('  -  '), pdf.M, pdf.curY, 9, DARK); pdf.down(14); }
  if (data.certifications?.length) {
    section('CERTIFICATIONS');
    data.certifications.forEach((c) => { pdf.checkPage(12); pdf.text(`- ${c}`, pdf.M, pdf.curY, 9, DARK); pdf.down(13); });
  }

  const date = new Date().toLocaleDateString('fr-FR');
  const nameForFooter = data.nom || data.nom_complet || '';
  pdf.checkPage(20);
  pdf.down(6);
  pdf.hline(LGRAY);
  pdf.text(`${nameForFooter} - Genere le ${date} - LinkedIn Profiler`, pdf.M, pdf.curY, 7, [160, 160, 160]);

  return pdf.toBase64();
}

// =============================================================
// ─── PDF — ENTREPRISE ────────────────────────────────────────
// =============================================================

function buildCompanyPDF(data, logoDataUrl) {
  const BLUE  = [10, 102, 194];
  const DARK  = [25, 25, 25];
  const WHITE = [255, 255, 255];
  const LGRAY = [230, 230, 230];

  const pdf = new PDFBuilder();
  pdf.addPage();

  const hdrH = 52;
  pdf.filledRect(0, pdf.H - hdrH, pdf.W, hdrH, BLUE);
  pdf.curY = pdf.H - 18;
  pdf.text(data.nom || 'Entreprise', pdf.M, pdf.curY, 20, WHITE, true);
  pdf.down(9);
  if (data.secteur) { pdf.text(data.secteur, pdf.M, pdf.curY, 10, [200, 225, 255]); pdf.down(7); }
  pdf.curY = pdf.H - hdrH - 10;

  const infos = [
    data.taille         && `Taille : ${data.taille}`,
    data.annee_creation && `Fondee en ${data.annee_creation}`,
    data.siege_social   && `Siege : ${data.siege_social}`,
    data.nb_abonnes     && `Abonnes : ${data.nb_abonnes}`,
    data.site_web       && `Web : ${data.site_web}`,
    data.linkedin_url   && `LinkedIn : ${data.linkedin_url}`,
  ].filter(Boolean);
  if (infos.length) {
    const rowH = 12, boxH = infos.length * rowH + 10;
    pdf.filledRect(pdf.M - 4, pdf.curY - boxH + 8, pdf.W - pdf.M * 2 + 8, boxH, [245, 248, 252]);
    infos.forEach((c) => { pdf.text(c, pdf.M, pdf.curY, 8.5, DARK); pdf.down(rowH); });
    pdf.down(6);
  }

  const section = (title) => { pdf.checkPage(30); pdf.down(8); pdf.text(title, pdf.M, pdf.curY, 11, BLUE, true); pdf.down(5); pdf.hline(BLUE); pdf.down(4); };

  if (data.description) { section('À PROPOS'); pdf.wrappedText(data.description, pdf.M, pdf.curW, 9, DARK, false, 12); pdf.down(4); }
  if (data.specialites) {
    const sp = Array.isArray(data.specialites) ? data.specialites.join(' · ') : String(data.specialites);
    if (sp.trim()) { section('SPÉCIALITÉS'); pdf.wrappedText(sp, pdf.M, pdf.curW, 9, DARK, false, 12); pdf.down(4); }
  }

  const date = new Date().toLocaleDateString('fr-FR');
  pdf.curY = pdf.M - 10;
  pdf.hline(LGRAY);
  pdf.text(`Généré le ${date} · LinkedIn Profiler`, pdf.M, pdf.curY, 7, [160, 160, 160]);

  return pdf.toBase64();
}

// =============================================================
// ─── HELPERS UI ──────────────────────────────────────────────
// =============================================================

function setStatus(ico, msg) {
  document.getElementById('statusIco').textContent = ico;
  document.getElementById('statusTxt').textContent = msg;
}

function step(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `step ${state}`;
  const ic = el.querySelector('.step-ic');
  if (state === 'active') ic.innerHTML = '<span class="spin"></span>';
  else if (state === 'done')  ic.textContent = '✅';
  else if (state === 'error') ic.textContent = '❌';
}

function openAirtable() {
  loadConfig().then((config) => {
    if (!config) return;
    let tableId = config.tableId;
    if (_pageType === 'company') tableId = config.companyTableId || config.tableId;
    if (_pageType === 'feed' || _pageType === 'post') tableId = config.jobsTableId || config.tableId;
    chrome.tabs.create({ url: `https://airtable.com/${config.baseId}/${tableId}` });
  });
}
