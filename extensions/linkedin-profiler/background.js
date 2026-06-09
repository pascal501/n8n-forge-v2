// =============================================================
// background.js — Service Worker unifié LinkedIn Profiler
//
// Fusionne :
//   - Handoff : LLM dual (Gemini + OpenRouter), normalisation URL,
//     Airtable CRUD, features A-G, Completion, prompts structurés
//   - Existing : batch engine (runBatch, fetchBatchQueue, enrichOneRecord),
//     keepAlive, batch-monitor, PDF natif LinkedIn
//
// Config : TOUT vient de chrome.storage.sync (Options page).
//   Aucune clé API, aucun ID hardcodé.
// =============================================================

'use strict';

// =============================================================
// ─── CHARGEMENT DE LA CONFIGURATION ──────────────────────────
//
// Charge la config depuis chrome.storage.sync à chaque appel.
// Pas de cache global — le service worker peut redémarrer.
// =============================================================

const ALL_CONFIG_KEYS = [
  'airtableToken', 'geminiKey', 'openrouterKey', 'batchDelay', 'batchMax',
  'activeTarget',
  'lcm_baseId', 'lcm_contactsTableId', 'lcm_companiesTableId', 'lcm_jobsTableId',
  'clients_baseId', 'clients_contactsTableId', 'clients_companiesTableId',
];

async function loadConfig() {
  const raw = await new Promise((resolve) => {
    chrome.storage.sync.get(ALL_CONFIG_KEYS, (data) => resolve(data));
  });

  const target = raw.activeTarget || 'lcm';
  const fm = FIELD_MAPS[target] || FIELD_MAPS.lcm;

  // Résolution base/tables selon la cible active
  let baseId, tableId, companyTableId;
  if (target === 'clients') {
    baseId        = raw.clients_baseId;
    tableId       = raw.clients_contactsTableId;
    companyTableId = raw.clients_companiesTableId;
  } else {
    baseId        = raw.lcm_baseId;
    tableId       = raw.lcm_contactsTableId;
    companyTableId = raw.lcm_companiesTableId;
  }

  // Offres emploi : toujours dans LCM
  const jobsTableId   = raw.lcm_jobsTableId || '';
  const jobsBaseId    = raw.lcm_baseId || '';

  return {
    airtableToken: raw.airtableToken,
    geminiKey:     raw.geminiKey || '',
    openrouterKey: raw.openrouterKey || '',
    batchDelay:    raw.batchDelay || 45,
    batchMax:      raw.batchMax || 50,
    activeTarget:  target,
    baseId,
    tableId,
    companyTableId: companyTableId || '',
    jobsTableId,
    jobsBaseId,
    cf:  fm.contact,   // contact field names
    cpf: fm.company,   // company field names
    batchFormula: fm.batchFormula,
    // Accès aux deux bases (pour batch multi-base éventuel)
    raw,
  };
}

// =============================================================
// ─── MAPPING DES CHAMPS AIRTABLE ─────────────────────────────
//
// Noms des champs dans les tables Contacts et Comptes Cibles.
// Ces noms sont identiques entre les deux bases (CLIENTS et
// LinkedIn Contact Management) SAUF :
//   - CLIENTS utilise "Company Name" (texte libre)
//   - LinkedIn Contact Management utilise "Entreprise" (texte libre aussi
//     dans la table contacts, linked record dans Comptes Cibles)
//
// Le champ utilisé est déterminé dynamiquement lors du PATCH/POST
// en fonction de la base cible.
// =============================================================

// =============================================================
// ─── FIELD MAPS PAR CIBLE ────────────────────────────────────
//
// Chaque base a des noms de champs différents.
// La cible active ('lcm' ou 'clients') détermine quel mapping
// est utilisé. loadConfig() résout ceci automatiquement.
//
// Convention : null = le champ n'existe pas dans cette base.
// Le code doit vérifier avant d'écrire.
// =============================================================

const FIELD_MAPS = {
  lcm: {
    contact: {
      profileName:      'Profile Name',
      prenom:           'Prénom',
      nom:              'Nom',
      linkedinUrl:      'LinkedIn URL',
      poste:            'Poste',
      entrepriseText:   'Entreprise',           // texte libre
      localisation:     'Location',
      email:            'Email',
      telephone:        'Téléphone',
      siteWeb:          'Site web',
      entrepriseUrl:    'Entreprise profile URL',
      enrichmentDate:   'Enrichment Date',
      profileSummary:   'Profile Summary',
      notes:            'Notes',
      photoProfile:     'Photo Profile',
      profilePdf:       'Profile PDF',
      completion:       'Completion',
      companyLink:      'Comptes Cibles',       // linked record → Comptes Cibles
      confirmedProspect:'Confirmed as Prospect',
      confirmedResource:'Confirmed as Resource',
      connecteLe:       'Connecté le',
      contactsEnCommuns:'Contacts en communs',
      statutProspection: null,                  // n'existe pas en LCM contacts
    },
    company: {
      nom:              'Entreprise',
      linkedinUrl:      'Page LinkedIn entreprise',
      description:      'Description',
      secteur:          'Secteur',
      taille:           'Taille',
      nbAbonnes:        'Nb abonnés',
      specialites:      'Spécialités',
      anneeCreation:    'Année de création',
      siteWeb:          'Site web',
      logo:             'Logo',
      profilePdf:       'Profile PDF',
      profileSummary:   'Profile Summary',
      enrichmentDate:   'Enrichment Date',
      notes:            'Notes',
      completion:       'Completion',
      contactsLink:     'Contacts LinkedIn',    // linked record → Contacts LinkedIn
      statutProspection:'Statut prospection',
      dernierContact:   'Dernier contact',
      dateRelance:      'Date de relance',
    },
    // Traite si : URL présente ET (jamais enrichi OU résumé erroné =
    // le nom du contact n'apparaît pas dans le Profile Summary).
    batchFormula: "AND({LinkedIn URL} != '', OR({Enrichment Date} = '', AND({Profile Summary} != '', NOT(FIND(LOWER({Nom}), LOWER({Profile Summary}))))))",
  },

  clients: {
    contact: {
      profileName:      'Profile Name',
      prenom:           'Prénom',
      nom:              'Nom',
      linkedinUrl:      'LinkedIn URL',
      poste:            'Poste',
      entrepriseText:   'Company Name',         // texte libre (champ différent !)
      localisation:     'Location',
      email:            'Email',
      telephone:        'Téléphone',
      siteWeb:          'Site web',
      entrepriseUrl:    'Entreprise profile URL',
      enrichmentDate:   null,                   // n'existe pas en CLIENTS
      profileSummary:   'Profile Summary',
      notes:            'Notes',
      photoProfile:     'Photo Profile',
      profilePdf:       'Profile PDF',
      completion:       'Completion',
      companyLink:      'Entreprise',           // linked record → Companies
      confirmedProspect:'Confirmed as Prospect',
      confirmedResource:'Confirmed as Resource',
      connecteLe:       'Connecté le',
      contactsEnCommuns:'Contacts en communs',
      statutProspection:'Statut Prospection',
    },
    company: {
      nom:              'Company Name',
      linkedinUrl:      'Linkedin Url',
      description:      'Description',
      secteur:          'Secteur',
      taille:           'Taille',
      nbAbonnes:        'Nb abonnés',
      specialites:      'Spécialités',
      anneeCreation:    'Année de création',
      siteWeb:          'Site web',
      logo:             'Company Logo',
      profilePdf:       'Profile PDF',
      profileSummary:   'Profile Summary',
      enrichmentDate:   'Enrichment Date',
      notes:            'Notes',
      completion:       'Completion',
      contactsLink:     'Related Contacts',
      statutProspection:'Statut prospection',
      dernierContact:   'Dernier contact',
      dateRelance:      'Date de relance',
    },
    // Traite si : URL présente ET (pas de résumé OU résumé erroné =
    // le nom du contact n'apparaît pas dans le Profile Summary).
    batchFormula: "AND({LinkedIn URL} != '', OR({Profile Summary} = '', NOT(FIND(LOWER({Nom}), LOWER({Profile Summary})))))",
  },
};

// Valeurs exactes des singleSelect (emojis inclus)
const COMPLETION = {
  INCOMPLET:  '🔴 Incomplet',
  PARTIEL:    '🟡 Partiel',
  JOIGNABLE:  '📧 Joignable',
  APPELABLE:  '📞 Appelable',
  COMPLET:    '✅ Complet',
};

const COMPANY_COMPLETION = {
  INCOMPLET:  '🔴 Incomplet',
  PARTIEL:    '🟡 Partiel',
  DOCUMENTE:  '🌐 Documenté',
  COMPLET:    '✅ Complet',
};

const PROSPECT_STATUS = {
  NOUVEAU:   '🆕 Nouveau',
  QUALIFIER: '🔍 À qualifier',
  CONTACTER: '📞 À contacter',
  RDV:       '🤝 RDV pris',
  VEILLE:    '❄️ En veille',
  EXCLU:     '🚫 Exclu (client Shodo)',
};

// =============================================================
// ─── NORMALISATION DES URLS LINKEDIN ─────────────────────────
// =============================================================

function normalizeLinkedInUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hostname = 'www.linkedin.com';
    u.search = '';
    u.hash = '';
    let path = u.pathname.toLowerCase().replace(/\/+$/, '');
    // Garder uniquement /in/slug
    const m = path.match(/\/in\/([^/]+)/);
    if (m) path = `/in/${m[1]}`;
    return `https://www.linkedin.com${path}`;
  } catch {
    return raw.split('?')[0].replace(/\/+$/, '');
  }
}

function normalizeLinkedInCompanyUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hostname = 'www.linkedin.com';
    u.search = '';
    u.hash = '';
    let path = u.pathname.toLowerCase().replace(/\/+$/, '');
    const m = path.match(/\/company\/([^/]+)/);
    if (m) path = `/company/${m[1]}`;
    return `https://www.linkedin.com${path}`;
  } catch {
    return raw.split('?')[0].replace(/\/+$/, '');
  }
}

// =============================================================
// ─── AIRTABLE — REQUÊTES GÉNÉRIQUES ─────────────────────────
// =============================================================

async function airtableRequest(token, method, path, body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`https://api.airtable.com/v0${path}`, opts);
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Airtable ${method} ${path.substring(0, 40)} : ${json.error?.message || JSON.stringify(json)}`);
  return json;
}

// Cache des field IDs par table (pour uploadAttachment)
async function getFieldId(token, baseId, tableId, fieldName) {
  const key = `fids_${baseId}_${tableId}`;
  const stored = await chrome.storage.local.get(key);
  let map = stored[key];
  if (!map) {
    const schema = await airtableRequest(token, 'GET', `/meta/bases/${baseId}/tables`);
    const table = schema.tables?.find((t) => t.id === tableId);
    if (!table) throw new Error(`Table ${tableId} introuvable`);
    map = {};
    table.fields.forEach((f) => { map[f.name] = f.id; });
    await chrome.storage.local.set({ [key]: map });
  }
  return map[fieldName] || null;
}

// Upload d'une pièce jointe via content.airtable.com (field ID-based)
async function uploadAttachment(token, baseId, tableId, recordId, fieldName, filename, dataOrBase64, mimeType) {
  const fieldId = await getFieldId(token, baseId, tableId, fieldName);
  if (!fieldId) throw new Error(`Champ "${fieldName}" introuvable`);

  let b64, contentType;

  if (dataOrBase64.startsWith('data:')) {
    // Format data URL : data:image/jpeg;base64,/9j/4AAQ...
    const [meta, data] = dataOrBase64.split(',');
    contentType = meta.replace('data:', '').replace(';base64', '');
    b64 = data;
  } else {
    // Base64 brut
    b64 = dataOrBase64;
    contentType = mimeType || 'application/octet-stream';
  }

  const resp = await fetch(
    `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, filename, file: b64 }),
    }
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || JSON.stringify(json));
  return json;
}

// =============================================================
// ─── AIRTABLE — RECHERCHE ────────────────────────────────────
// =============================================================

async function searchContact(token, baseId, tableId, linkedinUrl) {
  if (!linkedinUrl) return null;
  const normalized = normalizeLinkedInUrl(linkedinUrl);
  // Extraire le slug (/in/xxx) pour une recherche tolérante :
  // certaines fiches ont une URL sans protocole ou avec un sous-domaine
  // différent (fr.linkedin.com vs www.linkedin.com). FIND sur le slug
  // matche toutes les variantes et évite les doublons.
  const slugMatch = normalized.match(/\/in\/([^/]+)/);
  const slug = slugMatch ? `/in/${slugMatch[1]}` : normalized;
  const formula = encodeURIComponent(`FIND("${slug}", {LinkedIn URL})`);
  const r = await fetch(
    `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula=${formula}&maxRecords=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return null;
  const d = await r.json();
  return d.records?.[0] || null;
}

async function searchCompany(token, baseId, companyTableId, linkedinUrl, companyName, cpf) {
  if (!companyTableId) return null;
  if (!cpf) cpf = FIELD_MAPS.lcm.company; // fallback

  // Recherche par URL d'abord
  if (linkedinUrl && cpf.linkedinUrl) {
    const normalized = normalizeLinkedInCompanyUrl(linkedinUrl);
    const formula = encodeURIComponent(`{${cpf.linkedinUrl}} = "${normalized}"`);
    const r = await fetch(
      `https://api.airtable.com/v0/${baseId}/${companyTableId}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (r.ok) {
      const d = await r.json();
      if (d.records?.length) return d.records[0];
    }
  }

  // Fallback : recherche par nom
  if (companyName && cpf.nom) {
    const safeName = companyName.replace(/"/g, '\\"');
    const formula = encodeURIComponent(`LOWER({${cpf.nom}}) = LOWER("${safeName}")`);
    const r = await fetch(
      `https://api.airtable.com/v0/${baseId}/${companyTableId}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (r.ok) {
      const d = await r.json();
      if (d.records?.length) return d.records[0];
    }
  }

  return null;
}

async function findContactsByCompanyName(token, baseId, tableId, companyName, cf) {
  if (!companyName) return [];
  if (!cf) cf = FIELD_MAPS.lcm.contact; // fallback
  const compField = cf.entrepriseText;
  const safeName = companyName.replace(/"/g, '\\"');
  const formula = encodeURIComponent(`LOWER({${compField}}) = LOWER("${safeName}")`);
  const fields = ['Profile Name', 'Poste', 'LinkedIn URL', compField]
    .map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

  const r = await fetch(
    `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula=${formula}&maxRecords=20&${fields}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return [];
  const d = await r.json();
  return (d.records || []).map((rec) => rec.id);
}

// =============================================================
// ─── COMPLETION ──────────────────────────────────────────────
// =============================================================

function computeCompletion(data) {
  const has = (v) => v && v !== 'null' && v !== 'undefined';
  const hasEmail = has(data.email);
  const hasPhone = has(data.telephone);
  const hasSummary = has(data.profileSummary);
  const hasPdf = !!data.hasPdf;

  if (hasEmail && hasPhone && hasSummary && hasPdf) return COMPLETION.COMPLET;
  if (hasPhone) return COMPLETION.APPELABLE;
  if (hasEmail) return COMPLETION.JOIGNABLE;
  if (hasSummary || has(data.poste)) return COMPLETION.PARTIEL;
  return COMPLETION.INCOMPLET;
}

function computeCompanyCompletion(data, hasLinkedContacts) {
  const has = (v) => v && v !== 'null' && v !== 'undefined';
  const hasSite = has(data.site_web);
  const hasDesc = has(data.description);
  const hasSecteur = has(data.secteur);

  if (hasSite && hasDesc && hasSecteur && hasLinkedContacts) return COMPANY_COMPLETION.COMPLET;
  if (hasSite && (hasDesc || hasSecteur)) return COMPANY_COMPLETION.DOCUMENTE;
  if (hasDesc || hasSecteur || has(data.taille)) return COMPANY_COMPLETION.PARTIEL;
  return COMPANY_COMPLETION.INCOMPLET;
}

// =============================================================
// ─── LLM — GEMINI + OPENROUTER ──────────────────────────────
// =============================================================

async function _geminiCall(geminiKey, prompt) {
  if (!geminiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!resp.ok) {
      console.warn('[LLM] Gemini HTTP', resp.status);
      return null;
    }
    const json = await resp.json();
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.warn('[LLM] Gemini error:', e.message);
    return null;
  }
}

async function _openrouterCall(openrouterKey, prompt) {
  if (!openrouterKey) return null;
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!resp.ok) {
      console.warn('[LLM] OpenRouter HTTP', resp.status);
      return null;
    }
    const json = await resp.json();
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.warn('[LLM] OpenRouter error:', e.message);
    return null;
  }
}

// ─── Prompts LLM ─────────────────────────────────────────────

function buildProfilePrompt(rawText, contactInfo) {
  const contactBlock = contactInfo
    ? `\nINFORMATIONS DE CONTACT DÉJÀ EXTRAITES DU DOM (source fiable, prioritaire) :\n` +
      `- Email : ${contactInfo.email || 'non trouvé'}\n` +
      `- Téléphone : ${contactInfo.phone || 'non trouvé'}\n` +
      `- Site web : ${contactInfo.website || 'non trouvé'}\n` +
      `- Twitter : ${contactInfo.twitter || 'non trouvé'}\n`
    : '';

  return `Tu es un extracteur de données LinkedIn. Analyse le texte ci-dessous et retourne un objet JSON avec ces champs EXACTEMENT :

{
  "nom_complet": "Prénom Nom",
  "prenom": "Prénom",
  "nom": "Nom",
  "titre": "Poste actuel complet",
  "entreprise_actuelle": "Nom de l'entreprise actuelle",
  "entreprise_url": "URL LinkedIn de l'entreprise si visible (format /company/slug)",
  "localisation": "Ville, Région ou Pays",
  "email": "email@exemple.com ou null",
  "telephone": "+33 6 12 34 56 78 ou null",
  "site_web": "https://... ou null",
  "resume": "Paragraphe 'À propos' du profil, tel quel, sans modification",
  "experiences": [{"poste": "...", "entreprise": "...", "periode": "...", "description": "..."}],
  "formations": [{"etablissement": "...", "diplome": "...", "periode": "..."}],
  "competences": ["compétence1", "compétence2"],
  "langues": ["Français", "Anglais"],
  "certifications": ["Certification 1"],
  "linkedin_url": null
}

=== RÈGLES ABSOLUES ===
1. N'invente AUCUNE information. Si absent du texte → null ou tableau vide.
2. Pour email/téléphone : utilise EN PRIORITÉ les informations de contact ci-dessous (extraites du DOM). Ne les invente JAMAIS.
3. Le champ "resume" doit être le texte "À propos" tel quel. Ne le résume pas, ne le reformule pas.
4. Les expériences et formations doivent être extraites du texte. Si le texte n'en contient pas → tableau vide [].
5. Retourne UNIQUEMENT le JSON, sans texte avant ni après.
6. Pour les descriptions d'expérience : EXCLURE les lignes de compétences LinkedIn (ex: "C#, Scrum et 11 compétences de plus", "Développement de logiciel, Logiciel en tant que Service (SaaS) et 3 compétences de plus"). Ces lignes ne font PAS partie de la description.
${contactBlock}
=== TEXTE DE LA PAGE LINKEDIN ===
${rawText}`;
}

function buildCompanyPrompt(rawText, linkedinUrl) {
  return `Tu es un extracteur de données d'entreprise LinkedIn. Analyse le texte ci-dessous et retourne un objet JSON avec ces champs EXACTEMENT :

{
  "nom": "Nom de l'entreprise",
  "secteur": "Secteur d'activité",
  "description": "Description complète de l'entreprise, telle quelle",
  "taille": "Taille (ex: 51-200 employés)",
  "siege_social": "Ville, Pays",
  "annee_creation": "2005 ou null",
  "nb_abonnes": "12 345 abonnés ou null",
  "site_web": "https://... ou null",
  "specialites": ["spécialité1", "spécialité2"],
  "linkedin_url": "${linkedinUrl || ''}"
}

=== RÈGLES ABSOLUES ===
1. N'invente AUCUNE information. Si absent → null ou tableau vide.
2. Retourne UNIQUEMENT le JSON.

=== TEXTE DE LA PAGE ===
${rawText}`;
}

function buildPostPrompt(postText, authorName) {
  return `Analyse ce post LinkedIn de recrutement. Retourne un JSON :

{
  "titre": "Titre du poste recherché (ou résumé court du besoin)",
  "categorie": "Développement|Infrastructure|Data|Cybersécurité|Management|Design|Autre",
  "technologies": ["tech1", "tech2"],
  "pertinence": 1-5,
  "description": "Résumé factuel du besoin en 2-3 phrases"
}

=== RÈGLES ===
1. N'invente rien. Si pas mentionné → null ou [].
2. pertinence : 5 = correspond exactement à un profil IT freelance, 1 = peu pertinent.
3. Retourne UNIQUEMENT le JSON.

=== AUTEUR : ${authorName || 'inconnu'} ===
${postText}`;
}

// ─── Dispatchers LLM ─────────────────────────────────────────

async function callLLM(config, rawText, contactInfo) {
  const prompt = buildProfilePrompt(rawText, contactInfo);
  // Gemini d'abord, OpenRouter en fallback
  const result = await _geminiCall(config.geminiKey, prompt)
    || await _openrouterCall(config.openrouterKey, prompt);
  if (!result) throw new Error('LLM : Gemini et OpenRouter ont échoué');
  return result;
}

async function callLLMCompany(config, rawText, linkedinUrl) {
  const prompt = buildCompanyPrompt(rawText, linkedinUrl);
  const result = await _geminiCall(config.geminiKey, prompt)
    || await _openrouterCall(config.openrouterKey, prompt);
  if (!result) throw new Error('LLM : Gemini et OpenRouter ont échoué');
  return result;
}

async function callLLMPost(config, postText, authorName) {
  const prompt = buildPostPrompt(postText, authorName);
  const result = await _geminiCall(config.geminiKey, prompt)
    || await _openrouterCall(config.openrouterKey, prompt);
  if (!result) throw new Error('LLM : Gemini et OpenRouter ont échoué');
  return result;
}

// =============================================================
// ─── RÉSUMÉ IA (PROFILE SUMMARY) ────────────────────────────
//
// Génère un résumé textuel (Markdown) pour le champ Profile Summary.
// Utilise Gemini en mode texte libre (pas JSON).
// 3 variantes : Prospect, Ressource, Généraliste.
// =============================================================

async function generateProfileSummary(config, profileData, classifications = {}) {
  const { geminiKey } = config;
  if (!geminiKey) return profileData.resume || '';

  let prompt;
  const data = [
    `Nom : ${profileData.nom_complet || ''}`,
    `Poste : ${profileData.titre || ''}`,
    `Entreprise : ${profileData.entreprise_actuelle || ''}`,
    profileData.localisation ? `Localisation : ${profileData.localisation}` : '',
    profileData.resume ? `\nÀ propos :\n${profileData.resume}` : '',
    profileData.experiences?.length ? `\nExpériences :\n${profileData.experiences.map((e) => `- ${e.poste} chez ${e.entreprise} (${e.periode || ''})`).join('\n')}` : '',
    profileData.formations?.length ? `\nFormations :\n${profileData.formations.map((f) => `- ${f.etablissement} — ${f.diplome || ''} (${f.periode || ''})`).join('\n')}` : '',
    profileData.competences?.length ? `\nCompétences : ${profileData.competences.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  if (classifications.prospect && !classifications.resource) {
    prompt = 'Tu rédiges une fiche d\'approche client stratégique pour un commercial ESN. ' +
      'Rédige en français un résumé détaillé (7-10 phrases) couvrant : rôle, enjeux IT, expertise, stabilité, angle commercial, connexions.\n\n' + data;
  } else if (classifications.resource && !classifications.prospect) {
    prompt = 'Tu rédiges une fiche candidat détaillée pour un commercial ESN. ' +
      'Rédige en français un résumé complet (7-10 phrases) couvrant : expérience totale, séniorité, stack technique, parcours, mobilité, positionnement placement.\n\n' + data;
  } else {
    prompt = 'Tu rédiges une fiche de synthèse généraliste sur cette personne. ' +
      'Rédige en français un résumé complet (7-10 phrases) couvrant : profil, expérience, parcours, contexte actuel, caractéristiques clés.\n\n' + data;
  }

  prompt += '\n\n=== RÈGLE ABSOLUE — ZÉRO HALLUCINATION ===\n' +
    'Utilise EXCLUSIVEMENT les informations ci-dessus. N\'invente JAMAIS.\n' +
    'Si une information manque, écris « non précisé » ou n\'en parle pas.\n' +
    'Commence DIRECTEMENT par le contenu. Pas de titre ni d\'introduction.';

  // Appel Gemini en mode texte (pas JSON)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || `Gemini HTTP ${resp.status}`);
  let txt = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!txt) return profileData.resume || '';

  // Nettoie les préambules conversationnels
  txt = txt.replace(/^(voici|here is|here's)[^\n]*:?\s*\n+/i, '')
    .replace(/^[-–—\s]*\n+/, '')
    .trim();
  return txt;
}

// =============================================================
// ─── IMAGE EN BASE64 ────────────────────────────────────────
// =============================================================

async function fetchImageAsBase64(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const mimeType = resp.headers.get('content-type') || 'image/jpeg';
    return { base64, mimeType, dataUrl: `data:${mimeType};base64,${base64}` };
  } catch {
    return null;
  }
}

// =============================================================
// ─── CRÉATION / MISE À JOUR DE CONTACTS ─────────────────────
// =============================================================

function buildHistoryEntry(oldFields, fresh, cf) {
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR');
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // Tracer TOUS les champs susceptibles d'être mis à jour
  // pour ne jamais perdre d'anciennes valeurs.
  const tracked = [
    [cf.profileName, fresh.nom_complet, 'Profile Name'],
    [cf.prenom, fresh.prenom, 'Prénom'],
    [cf.nom, fresh.nom, 'Nom'],
    [cf.poste, fresh.titre, 'Poste'],
    [cf.localisation, fresh.localisation, 'Location'],
    [cf.entrepriseText, fresh.entreprise, 'Entreprise'],
    [cf.entrepriseUrl, fresh.entrepriseUrl, 'Entreprise URL'],
    [cf.email, fresh.email, 'Email'],
    [cf.telephone, fresh.telephone, 'Téléphone'],
    [cf.siteWeb, fresh.siteWeb, 'Site web'],
    [cf.profileSummary, fresh.profileSummary, 'Profile Summary'],
  ].filter(([field]) => field); // ignore les champs null

  const lines = [];
  for (const [field, freshVal, label] of tracked) {
    const oldVal = (oldFields[field] || '').toString().trim();
    const newVal = (freshVal || '').toString().trim();
    if (newVal && oldVal && newVal !== oldVal) {
      lines.push(`• ${label}: ${oldVal.slice(0, 200)} → ${newVal.slice(0, 200)}`);
    }
  }

  let entry = `📅 ${date} ${time} — ENRICHISSEMENT`;
  if (lines.length > 0) {
    entry += ` (${lines.length} champ${lines.length > 1 ? 's' : ''} modifié${lines.length > 1 ? 's' : ''}) :\n` + lines.join('\n');
  } else {
    entry += ' (aucun changement détecté)';
  }
  return { entry, changeCount: lines.length };
}

async function createOrUpdateContact(config, data, existing, classifications = {}) {
  const { airtableToken: token, baseId, tableId, cf } = config;

  const fields = {};
  const _set = (key, val) => { const f = cf[key]; if (f && val) fields[f] = val; };

  _set('profileName', data.nom_complet);
  _set('prenom', data.prenom);
  _set('nom', data.nom);
  _set('linkedinUrl', data.linkedin_url);
  _set('poste', data.titre);
  _set('localisation', data.localisation);
  _set('siteWeb', data.site_web);
  _set('entrepriseUrl', data.entreprise_url);
  _set('entrepriseText', data.entreprise_actuelle);
  _set('profileSummary', data._profileSummary);
  _set('contactsEnCommuns', data._mutualConnections);
  _set('connecteLe', data._connectedDate);

  // Enrichment Date (si le champ existe dans cette base)
  if (cf.enrichmentDate) fields[cf.enrichmentDate] = new Date().toISOString();

  // Completion (si le champ existe dans cette base)
  if (cf.completion) {
    fields[cf.completion] = computeCompletion({
      email: data.email,
      telephone: data.telephone,
      profileSummary: data._profileSummary,
      poste: data.titre,
      hasPdf: true,
    });
  }

  // Classifications
  if (classifications.prospect !== undefined && cf.confirmedProspect) fields[cf.confirmedProspect] = classifications.prospect;
  if (classifications.resource !== undefined && cf.confirmedResource)  fields[cf.confirmedResource] = classifications.resource;

  const old = existing?.fields || {};

  // ANTI-OVERWRITE : Email et Téléphone ne sont jamais écrasés
  if (data.email && !old[cf.email])         fields[cf.email] = data.email;
  if (data.telephone && !old[cf.telephone]) fields[cf.telephone] = data.telephone;

  let recordId;
  if (existing) {
    // Mise à jour — historisation dans Notes de TOUS les champs modifiés
    const { entry } = buildHistoryEntry(old, {
      nom_complet: data.nom_complet,
      prenom: data.prenom,
      nom: data.nom,
      titre: data.titre,
      localisation: data.localisation,
      entreprise: data.entreprise_actuelle,
      entrepriseUrl: data.entreprise_url,
      email: data.email,
      telephone: data.telephone,
      siteWeb: data.site_web,
      profileSummary: data._profileSummary,
    }, cf);
    if (cf.notes) {
      const prevNotes = (old[cf.notes] || '').toString();
      fields[cf.notes] = prevNotes
        ? `${entry}\n\n${'─'.repeat(30)}\n\n${prevNotes}`
        : entry;
    }

    // Vide le PDF avant re-upload
    if (cf.profilePdf) fields[cf.profilePdf] = [];

    const updated = await airtableRequest(token, 'PATCH', `/${baseId}/${tableId}`,
      { records: [{ id: existing.id, fields }] });
    recordId = updated.records[0].id;
  } else {
    // Création
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const created = [];
    if (data.localisation) created.push(`• Location: ${data.localisation}`);
    if (data.entreprise_actuelle) created.push(`• Entreprise: ${data.entreprise_actuelle}`);
    if (data.email) created.push(`• Email: ${data.email}`);
    if (data.telephone) created.push(`• Téléphone: ${data.telephone}`);
    let creationEntry = `📅 ${dateStr} ${timeStr} — CRÉATION DE LA FICHE`;
    if (created.length) creationEntry += ' :\n' + created.join('\n');
    if (cf.notes) fields[cf.notes] = creationEntry;

    // Email/Téléphone en création (pas de protection anti-overwrite)
    if (data.email) fields[cf.email] = data.email;
    if (data.telephone) fields[cf.telephone] = data.telephone;

    const rec = await airtableRequest(token, 'POST', `/${baseId}/${tableId}`, { fields });
    recordId = rec.id;
  }

  return recordId;
}

async function createOrUpdateCompany(config, data, existing, linkedContactIds = []) {
  const { airtableToken: token, baseId, companyTableId, cpf } = config;
  if (!companyTableId) throw new Error('Table ID Entreprises non configuré');

  const fields = {};
  const _set = (key, val) => { const f = cpf[key]; if (f && val) fields[f] = val; };

  _set('nom', data.nom);
  _set('linkedinUrl', data.linkedin_url);
  _set('description', data.description);
  _set('secteur', data.secteur);
  _set('taille', data.taille);
  _set('nbAbonnes', data.nb_abonnes);
  _set('siteWeb', data.site_web);
  _set('anneeCreation', data.annee_creation);

  if (data.specialites && cpf.specialites) {
    const sp = Array.isArray(data.specialites) ? data.specialites.join(', ') : String(data.specialites);
    fields[cpf.specialites] = sp;
  }

  if (cpf.enrichmentDate) fields[cpf.enrichmentDate] = new Date().toISOString();
  if (cpf.completion) fields[cpf.completion] = computeCompanyCompletion(data, linkedContactIds.length > 0);

  // Liaison des contacts salariés
  if (linkedContactIds.length > 0 && cpf.contactsLink) {
    fields[cpf.contactsLink] = linkedContactIds.map((id) => ({ id }));
  }

  let recordId;
  if (existing) {
    const old = existing.fields || {};
    const now = new Date();
    const date = now.toLocaleDateString('fr-FR');
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const entry = `📅 ${date} ${time} — MISE À JOUR`;
    if (cpf.notes) {
      const prevNotes = (old[cpf.notes] || '').toString();
      fields[cpf.notes] = prevNotes ? `${entry}\n\n${'─'.repeat(30)}\n\n${prevNotes}` : entry;
    }
    if (cpf.profilePdf) fields[cpf.profilePdf] = [];

    const updated = await airtableRequest(token, 'PATCH', `/${baseId}/${companyTableId}`,
      { records: [{ id: existing.id, fields }] });
    recordId = updated.records[0].id;
  } else {
    const rec = await airtableRequest(token, 'POST', `/${baseId}/${companyTableId}`, { fields });
    recordId = rec.id;
  }

  return recordId;
}

// =============================================================
// ─── ORCHESTRATION — PROFIL ─────────────────────────────────
// =============================================================

async function handleProcessProfile({ rawText, contactInfo, linkedinUrl, photoUrl, companyProfileUrl, mutualConnections, experiences: domExperiences }) {
  const config = await loadConfig();
  if (!config.airtableToken || !config.baseId || !config.tableId) {
    throw new Error(`Configuration incomplète (${config.activeTarget}) — ouvrez les paramètres. baseId=${config.baseId ? 'OK' : 'VIDE'}, tableId=${config.tableId ? 'OK' : 'VIDE'}, token=${config.airtableToken ? 'OK' : 'VIDE'}`);
  }

  // 1. Normaliser l'URL
  linkedinUrl = normalizeLinkedInUrl(linkedinUrl);

  // 2. LLM — extraction structurée
  const data = await callLLM(config, rawText, contactInfo);
  data.linkedin_url = linkedinUrl;

  // Intégrer les coordonnées du DOM (prioritaires sur le LLM)
  if (contactInfo?.email && !data.email) data.email = contactInfo.email;
  if (contactInfo?.phone && !data.telephone) data.telephone = contactInfo.phone;
  if (contactInfo?.website && !data.site_web) data.site_web = contactInfo.website;
  if (contactInfo?.connectedDate) data._connectedDate = contactInfo.connectedDate;

  // Intégrer l'URL entreprise et les contacts en commun (du DOM)
  if (companyProfileUrl && !data.entreprise_url) data.entreprise_url = companyProfileUrl;
  if (mutualConnections) data._mutualConnections = mutualConnections;

  // Expériences scrapées du DOM (prioritaires sur le LLM — descriptions exactes)
  if (domExperiences?.length) data.experiences = domExperiences;

  // 3. Résumé IA (Profile Summary)
  try {
    data._profileSummary = await generateProfileSummary(config, data);
  } catch (e) {
    console.warn('[Profile] Summary error:', e.message);
    data._profileSummary = data.resume || '';
  }

  // 4. Recherche doublon
  const existing = await searchContact(config.airtableToken, config.baseId, config.tableId, linkedinUrl);

  // 5. Créer ou mettre à jour
  const recordId = await createOrUpdateContact(config, data, existing);

  // 6. Photo de profil
  let photoData = null;
  if (photoUrl) {
    photoData = await fetchImageAsBase64(photoUrl);
    if (photoData) {
      try {
        // Vide le champ photo avant re-upload
        const photoField = config.cf.photoProfile;
        await airtableRequest(config.airtableToken, 'PATCH', `/${config.baseId}/${config.tableId}`,
          { records: [{ id: recordId, fields: { [photoField]: [] } }] });
        await uploadAttachment(config.airtableToken, config.baseId, config.tableId, recordId,
          photoField, `photo_${Date.now()}.jpg`, photoData.dataUrl);
      } catch (e) {
        console.warn('[Profile] Photo upload:', e.message);
      }
    }
  }

  // 7. Feature C : liaison automatique contact → entreprise
  let companyLinkedId = null;
  if (data.entreprise_actuelle && config.companyTableId && config.cf.companyLink) {
    try {
      const company = await searchCompany(config.airtableToken, config.baseId,
        config.companyTableId, null, data.entreprise_actuelle, config.cpf);
      if (company) {
        companyLinkedId = company.id;
        await fetch(
          `https://api.airtable.com/v0/${config.baseId}/${config.tableId}/${recordId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${config.airtableToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fields: { [config.cf.companyLink]: [{ id: company.id }] },
            }),
          }
        );
      }
    } catch (_) { /* liaison non critique */ }
  }

  return {
    success: true,
    recordId,
    isUpdate: !!existing,
    structuredData: data,
    photoDataUrl: photoData?.dataUrl || null,
    companyLinkedId,
  };
}

// =============================================================
// ─── ORCHESTRATION — ENTREPRISE ─────────────────────────────
// =============================================================

async function handleProcessCompany({ rawText, linkedinUrl, logoUrl, companyName }) {
  const config = await loadConfig();
  if (!config.airtableToken || !config.baseId || !config.companyTableId) {
    throw new Error('Configuration incomplète — configurez la Table ID Entreprises');
  }

  linkedinUrl = normalizeLinkedInCompanyUrl(linkedinUrl);

  const data = await callLLMCompany(config, rawText, linkedinUrl);
  data.linkedin_url = linkedinUrl;
  if (!data.nom && companyName) data.nom = companyName;

  const existing = await searchCompany(config.airtableToken, config.baseId,
    config.companyTableId, linkedinUrl, null, config.cpf);

  // Liaison des contacts salariés
  let linkedContactIds = [];
  if (data.nom && config.tableId) {
    linkedContactIds = await findContactsByCompanyName(
      config.airtableToken, config.baseId, config.tableId, data.nom, config.cf);
  }
  if (linkedContactIds.length === 0 && companyName && companyName !== data.nom && config.tableId) {
    linkedContactIds = await findContactsByCompanyName(
      config.airtableToken, config.baseId, config.tableId, companyName, config.cf);
  }

  const recordId = await createOrUpdateCompany(config, data, existing, linkedContactIds);

  // Upload logo
  let logoData = null;
  const logoField = config.cpf.logo;
  if (logoUrl && logoField) {
    logoData = await fetchImageAsBase64(logoUrl);
    if (logoData) {
      try {
        await uploadAttachment(config.airtableToken, config.baseId, config.companyTableId, recordId,
          logoField, `logo_${Date.now()}.png`, logoData.dataUrl);
      } catch (e) {
        console.warn('[Company] Logo upload:', e.message);
      }
    }
  }

  return {
    success: true,
    recordId,
    isUpdate: !!existing,
    structuredData: data,
    logoDataUrl: logoData?.dataUrl || null,
    linkedContactsCount: linkedContactIds.length,
  };
}

// =============================================================
// ─── ORCHESTRATION — POST LINKEDIN ──────────────────────────
// =============================================================

async function handleCapturePost({ postText, authorName, authorUrl, postUrl }) {
  const config = await loadConfig();
  // Offres emploi toujours dans la base LCM
  if (!config.airtableToken || !config.jobsBaseId || !config.jobsTableId) {
    throw new Error('Configuration incomplète — configurez la Table ID Offres emploi (base LCM)');
  }

  const llm = await callLLMPost(config, postText, authorName);

  const fields = {
    'Titre': llm.titre || 'Post LinkedIn',
    'Source': 'LinkedIn',
    'Date publication': new Date().toISOString().split('T')[0],
    'Lien': postUrl || '',
  };
  if (llm.categorie)     fields['Catégorie'] = llm.categorie;
  if (llm.description)   fields['Description'] = llm.description;
  if (llm.pertinence)    fields['Pertinence'] = llm.pertinence;
  if (llm.technologies?.length) fields['Technologies'] = llm.technologies.join(', ');

  const rec = await airtableRequest(config.airtableToken, 'POST',
    `/${config.jobsBaseId}/${config.jobsTableId}`, { fields });

  return { success: true, recordId: rec.id, titre: llm.titre };
}

// =============================================================
// ─── FEATURE D — STATUT PROSPECTION ─────────────────────────
// =============================================================

async function handleUpdateProspectStatus({ recordId, status }) {
  if (!recordId || !status) throw new Error('recordId et status requis');
  const config = await loadConfig();
  if (!config.companyTableId) throw new Error('Table ID Entreprises non configuré');
  const cpf = config.cpf;

  const fields = {};
  if (cpf.statutProspection) fields[cpf.statutProspection] = status;
  const activeStatuses = [PROSPECT_STATUS.CONTACTER, PROSPECT_STATUS.RDV];
  if (activeStatuses.includes(status) && cpf.dernierContact) {
    fields[cpf.dernierContact] = new Date().toISOString().split('T')[0];
  }

  const r = await fetch(
    `https://api.airtable.com/v0/${config.baseId}/${config.companyTableId}/${recordId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${config.airtableToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Airtable PATCH status ${r.status}: ${err.substring(0, 200)}`);
  }
  return { success: true, status };
}

// =============================================================
// ─── FEATURE E — RELANCE ────────────────────────────────────
// =============================================================

async function handleSetRelance({ recordId, daysAhead }) {
  if (!recordId || !daysAhead) throw new Error('recordId et daysAhead requis');
  const config = await loadConfig();
  if (!config.companyTableId) throw new Error('Table ID Entreprises non configuré');
  const cpf = config.cpf;
  if (!cpf.dateRelance) throw new Error('Champ Date de relance non disponible dans cette base');

  const relanceDate = new Date();
  relanceDate.setDate(relanceDate.getDate() + daysAhead);
  const dateStr = relanceDate.toISOString().split('T')[0];

  const r = await fetch(
    `https://api.airtable.com/v0/${config.baseId}/${config.companyTableId}/${recordId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${config.airtableToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [cpf.dateRelance]: dateStr } }),
    }
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Airtable PATCH relance ${r.status}: ${err.substring(0, 200)}`);
  }
  return { success: true, dateRelance: dateStr };
}

// =============================================================
// ─── FEATURE A — VÉRIFICATION DOUBLON ────────────────────────
// =============================================================

async function handleCheckExisting({ linkedinUrl, entityType }) {
  const config = await loadConfig();
  if (!config.airtableToken || !config.baseId) return { exists: false };

  const isCompany = entityType === 'company';
  const normalized = isCompany
    ? normalizeLinkedInCompanyUrl(linkedinUrl)
    : normalizeLinkedInUrl(linkedinUrl);

  const table = isCompany ? config.companyTableId : config.tableId;
  if (!table) return { exists: false };

  const fm = isCompany ? config.cpf : config.cf;
  const urlField    = fm.linkedinUrl;
  const nameField   = isCompany ? fm.nom : fm.profileName;
  const dateField   = fm.enrichmentDate;  // peut être null
  const statusField = fm.statutProspection; // peut être null

  if (!urlField) return { exists: false };

  // Recherche tolérante par slug (même logique que searchContact) :
  // FIND("/in/slug", url) matche les variantes http/https, www/fr, avec ou sans /
  let searchTerm = normalized;
  if (!isCompany) {
    const sm = normalized.match(/\/in\/([^/]+)/);
    if (sm) searchTerm = `/in/${sm[1]}`;
  }
  const formula = encodeURIComponent(`FIND("${searchTerm}", {${urlField}})`);
  const requestedFields = [urlField, nameField, dateField, statusField].filter(Boolean);
  const fieldsParam = requestedFields.map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

  const r = await fetch(
    `https://api.airtable.com/v0/${config.baseId}/${table}?filterByFormula=${formula}&maxRecords=1&${fieldsParam}`,
    { headers: { Authorization: `Bearer ${config.airtableToken}` } }
  );
  if (!r.ok) return { exists: false };

  const d = await r.json();
  if (!d.records?.length) return { exists: false };

  const rec = d.records[0];
  return {
    exists: true,
    recordId: rec.id,
    name: rec.fields[nameField] || null,
    lastUpdate: dateField ? (rec.fields[dateField] || null) : null,
    status: statusField ? (rec.fields[statusField] || null) : null,
    airtableUrl: `https://airtable.com/${config.baseId}/${table}/${rec.id}`,
  };
}

// =============================================================
// ─── FEATURE B — CONTACTS CONNUS DANS UNE ENTREPRISE ────────
// =============================================================

async function handleGetCompanyContacts({ companyName, linkedinUrl }) {
  const config = await loadConfig();
  if (!config.airtableToken || !config.baseId || !config.tableId) return { contacts: [] };
  const cf = config.cf;

  const results = [];

  // Stratégie 1 : par nom d'entreprise
  if (companyName && cf.entrepriseText) {
    const safeName = companyName.replace(/"/g, '\\"');
    const formula = encodeURIComponent(`LOWER({${cf.entrepriseText}}) = LOWER("${safeName}")`);
    const fields = [cf.profileName, cf.poste, cf.linkedinUrl, cf.entrepriseText]
      .filter(Boolean).map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const r = await fetch(
      `https://api.airtable.com/v0/${config.baseId}/${config.tableId}?filterByFormula=${formula}&maxRecords=20&${fields}`,
      { headers: { Authorization: `Bearer ${config.airtableToken}` } }
    );
    if (r.ok) {
      const d = await r.json();
      for (const rec of (d.records || [])) {
        results.push({
          id: rec.id,
          name: rec.fields[cf.profileName] || '—',
          poste: rec.fields[cf.poste] || '',
          linkedinUrl: rec.fields[cf.linkedinUrl] || '',
        });
      }
    }
  }

  // Stratégie 2 : par URL page entreprise
  if (results.length === 0 && linkedinUrl && cf.entrepriseUrl) {
    const normalizedUrl = normalizeLinkedInCompanyUrl(linkedinUrl);
    const formula = encodeURIComponent(`{${cf.entrepriseUrl}} = "${normalizedUrl}"`);
    const fields = [cf.profileName, cf.poste, cf.linkedinUrl]
      .filter(Boolean).map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const r = await fetch(
      `https://api.airtable.com/v0/${config.baseId}/${config.tableId}?filterByFormula=${formula}&maxRecords=20&${fields}`,
      { headers: { Authorization: `Bearer ${config.airtableToken}` } }
    );
    if (r.ok) {
      const d = await r.json();
      for (const rec of (d.records || [])) {
        if (!results.find((c) => c.id === rec.id)) {
          results.push({
            id: rec.id,
            name: rec.fields[cf.profileName] || '—',
            poste: rec.fields[cf.poste] || '',
            linkedinUrl: rec.fields[cf.linkedinUrl] || '',
          });
        }
      }
    }
  }

  return { contacts: results };
}

// ════════════════════════════════════════════════════════════════
// ║               MODE BATCH — Enrichir la base                  ║
// ║  Parcourt les contacts Airtable un par un, ouvre chaque      ║
// ║  profil LinkedIn, scrape (texte, photo, coordonnées, PDF),   ║
// ║  met à jour la fiche et historise dans Notes.                ║
// ════════════════════════════════════════════════════════════════

// État global du batch
const batchState = {
  running: false,
  stopRequested: false,
  current: 0,
  total: 0,
  ok: 0,
  failed: 0,
  currentName: '',
  lastError: '',
  logs: [],
};

// ─── Keep-alive : empêche le service worker MV3 de s'endormir ──
let keepAliveTimer = null;
function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000);
}
function stopKeepAlive() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}

// ─── Communication vers l'UI ─────────────────────────────────
function batchLog(line) {
  const stamp = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = `${stamp}  ${line}`;
  batchState.logs.push(entry);
  if (batchState.logs.length > 200) batchState.logs.shift();
  console.log('[Batch]', line);
  notifyBatch();
}

function notifyBatch() {
  chrome.runtime.sendMessage({
    action: 'batchProgress',
    state: {
      running: batchState.running,
      current: batchState.current,
      total: batchState.total,
      ok: batchState.ok,
      failed: batchState.failed,
      currentName: batchState.currentName,
      logs: batchState.logs.slice(-12),
    },
  }).catch(() => {});
}

// ─── File d'attente batch ────────────────────────────────────
async function fetchBatchQueue(token, baseId, tableId, maxCount, batchFormula, cf) {
  const formula = batchFormula;
  const records = [];
  let offset = null;

  // Champs à récupérer — adaptés à la cible
  const queryFields = [
    cf.profileName, cf.linkedinUrl, cf.localisation, cf.entrepriseText,
    cf.email, cf.telephone, cf.notes, cf.confirmedProspect, cf.confirmedResource,
    cf.profileSummary,
  ].filter(Boolean);

  do {
    let path = `/${baseId}/${tableId}?filterByFormula=${encodeURIComponent(formula)}&pageSize=100`;
    queryFields.forEach((f) => { path += `&fields[]=${encodeURIComponent(f)}`; });
    if (offset) path += `&offset=${offset}`;

    const res = await airtableRequest(token, 'GET', path);
    records.push(...(res.records || []));
    offset = res.offset || null;
  } while (offset && records.length < maxCount);

  return records.slice(0, maxCount);
}

// ─── Scraping d'un profil dans un onglet ─────────────────────
async function enrichProfileInTab(linkedinUrl, expectedName) {
  const profileUrl = linkedinUrl.replace(/\/$/, '').split('?')[0]
    .replace(/^(https?:\/\/)[a-z]{2,3}\.linkedin\.com/i, '$1www.linkedin.com') + '/';
  // active: true — LinkedIn (SPA) gèle son rendu dans un onglet en arrière-plan
  // (throttling Chrome), le profil ne se charge jamais. L'onglet doit être au
  // premier plan pour que `main h1` soit rendu. Contrepartie : vole le focus
  // ~10-15 s par profil pendant le batch.
  const tab = await chrome.tabs.create({ url: profileUrl, active: true });
  const result = { profile: null, photoB64: null };

  function waitTabComplete(timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tab load timeout')), timeoutMs);
      function onUpdate(id, info) {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          clearTimeout(timer);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdate);
    });
  }

  try {
    await waitTabComplete();
    await new Promise((r) => setTimeout(r, 4000));

    // Envoie le message SCRAPE_PROFILE au content script.
    // On réessaie tant que le nom est vide : chaque tentative relance
    // scrapeProfile (ré-attente du rendu + re-scroll), ce qui aide les
    // profils lents à charger dans un onglet en arrière-plan.
    // 4 tentatives : grâce au retour rapide côté content script quand le nom
    // est absent, un profil mort/redirigé échoue vite (~10s/essai max).
    let scrapeResult = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        scrapeResult = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PROFILE' });
        if (scrapeResult?.success && scrapeResult.data?.name?.trim()) break;
      } catch {
        // content script pas encore prêt
      }
      await new Promise((r) => setTimeout(r, 1800));
    }

    if (!scrapeResult?.success) throw new Error('Scrape impossible (content script muet)');

    const profile = scrapeResult.data;

    // ── GARDE-FOU ANTI-CORRUPTION ──────────────────────────────
    // Vérifier que la page réellement scrapée correspond au profil demandé.
    // Si LinkedIn a redirigé (profil indisponible → profil du compte connecté,
    // ou /feed), le slug diffère : on abandonne SANS écrire (évite d'écraser
    // une fiche avec l'identité de l'utilisateur connecté).
    const slugOf = (u) => {
      const m = /\/in\/([^/?#]+)/i.exec(u || '');
      if (!m) return null;
      try { return decodeURIComponent(m[1]).toLowerCase(); }
      catch { return m[1].toLowerCase(); }
    };
    // LinkedIn peut rediriger michelle-seillier-532904121 → michelle-seillier
    // (URL personnalisée modifiée). On compare aussi sans le suffixe numérique.
    const stripNumSuffix = (s) => s.replace(/-\d+$/, '');
    const wantSlug = slugOf(profileUrl);
    const gotSlug  = slugOf(profile.linkedinUrl);   // = window.location réel (getCleanUrl)
    if (!gotSlug || (gotSlug !== wantSlug && stripNumSuffix(gotSlug) !== stripNumSuffix(wantSlug))) {
      throw new Error(`Profil scrapé ≠ demandé (voulu: ${wantSlug || '?'}, obtenu: ${gotSlug || 'non-profil/redirigé'}) — fiche ignorée pour éviter une corruption.`);
    }
    if (!profile.name || !profile.name.trim()) {
      throw new Error('Nom de profil introuvable (page non chargée) — fiche ignorée.');
    }

    // ── GARDE-FOU NOM ────────────────────────────────────────────
    // LinkedIn peut afficher le profil du compte connecté (ex: Pascal Fontaine)
    // tout en gardant l'URL du profil demandé → le slug guard passe.
    // Si on a le nom attendu (batch), vérifier qu'au moins un mot du nom
    // attendu apparaît dans le nom scrapé. Sinon = contenu du mauvais profil.
    if (expectedName && expectedName.trim()) {
      const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const expectedWords = normalize(expectedName).split(/[\s\-]+/).filter(w => w.length >= 2);
      const scrapedNorm = normalize(profile.name);
      const match = expectedWords.some(w => scrapedNorm.includes(w));
      if (!match) {
        throw new Error(`Nom scrapé "${profile.name}" ≠ attendu "${expectedName}" — profil du compte connecté ? Fiche ignorée.`);
      }
    }

    // Page validée → on fige l'URL demandée (forme canonique www)
    profile.linkedinUrl = profileUrl.replace(/\/$/, '');

    // Photo en base64
    if (profile.photoUrl) {
      result.photoB64 = await fetchImageAsBase64(profile.photoUrl);
    }

    result.profile = profile;
    return result;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ─── Enrichissement d'UN enregistrement ──────────────────────
async function enrichOneRecord(record, config) {
  const old = record.fields || {};
  const cf = config.cf;
  const linkedinUrl = old[cf.linkedinUrl];

  // 1. Scrape — on passe le nom attendu pour détecter les cas où LinkedIn
  // affiche le profil du compte connecté au lieu du profil demandé.
  const expectedName = old[cf.profileName] || '';
  const { profile, photoB64 } = await enrichProfileInTab(linkedinUrl, expectedName);
  if (!profile) throw new Error('Profil non scrapé');

  // 2. LLM — extraction structurée
  const data = await callLLM(config, profile.rawText, profile.contactInfo);
  data.linkedin_url = normalizeLinkedInUrl(linkedinUrl);

  // Intégrer coordonnées DOM
  if (profile.contactInfo?.email && !data.email) data.email = profile.contactInfo.email;
  if (profile.contactInfo?.phone && !data.telephone) data.telephone = profile.contactInfo.phone;
  if (profile.contactInfo?.website && !data.site_web) data.site_web = profile.contactInfo.website;

  // Intégrer URL entreprise, contacts en commun et date de connexion (du DOM)
  if (profile.companyProfileUrl && !data.entreprise_url) data.entreprise_url = profile.companyProfileUrl;
  if (profile.mutualConnections) data._mutualConnections = profile.mutualConnections;
  if (profile.contactInfo?.connectedDate) data._connectedDate = profile.contactInfo.connectedDate;

  // Expériences scrapées du DOM (prioritaires sur le LLM)
  if (profile.experiences?.length) data.experiences = profile.experiences;

  // Nettoyage téléphone
  if (data.telephone) data.telephone = data.telephone.replace(/[^0-9+]/g, '');

  // 3. Résumé IA
  const classifications = {
    prospect: !!old[cf.confirmedProspect],
    resource: !!old[cf.confirmedResource],
  };
  try {
    data._profileSummary = await generateProfileSummary(config, data, classifications);
  } catch {
    data._profileSummary = data.resume || '';
  }

  // 4. Mise à jour directe du record en cours (pas de recherche par URL)
  // On utilise le record original du batch pour éviter de mettre à jour
  // le mauvais record si deux fiches partagent la même URL LinkedIn.
  const recordId = await createOrUpdateContact(config, data, record, classifications);

  // 6. Photo
  if (photoB64 && cf.photoProfile) {
    try {
      await airtableRequest(config.airtableToken, 'PATCH', `/${config.baseId}/${config.tableId}`,
        { records: [{ id: recordId, fields: { [cf.photoProfile]: [] } }] });
      await uploadAttachment(config.airtableToken, config.baseId, config.tableId, recordId,
        cf.photoProfile, 'photo.jpg', photoB64.dataUrl);
    } catch (e) {
      console.warn('[Batch] Photo upload:', e.message);
    }
  }

  // 7. PDF : non généré en batch (PDFBuilder = DOM, pas disponible dans le SW).
  // Le queue batch utilise la formule adaptée par base pour tracker l'enrichissement.

  return {
    name: data.nom_complet || old[cf.profileName] || '?',
    rawLen: (profile.rawText || '').length,
    expCount: (data.experiences || []).length,
    sumLen: (data._profileSummary || '').length,
  };
}

// ─── Boucle principale du batch ──────────────────────────────
async function runBatch(batchConfig) {
  if (batchState.running) return;

  Object.assign(batchState, {
    running: true, stopRequested: false, current: 0, total: 0,
    ok: 0, failed: 0, currentName: '', lastError: '', logs: [],
  });
  startKeepAlive();

  // Résoudre les field maps à partir de la cible choisie par le popup
  const target = batchConfig.activeTarget || 'lcm';
  const fm = FIELD_MAPS[target] || FIELD_MAPS.lcm;

  const config = {
    airtableToken: batchConfig.token,
    baseId: batchConfig.baseId,
    tableId: batchConfig.tableId,
    geminiKey: batchConfig.geminiKey || '',
    openrouterKey: batchConfig.openrouterKey || '',
    companyTableId: batchConfig.companyTableId || '',
    cf: fm.contact,
    cpf: fm.company,
    batchFormula: fm.batchFormula,
  };

  const delayMs = Math.max(10, batchConfig.batchDelay || 45) * 1000;
  const maxCount = Math.min(300, Math.max(1, batchConfig.maxCount || 50));

  try {
    batchLog(`🔎 Recherche des contacts à enrichir (max ${maxCount}) dans ${target.toUpperCase()}…`);
    // La formule Airtable encode la cohérence : ramène les fiches sans résumé
    // OU dont le résumé ne mentionne pas le nom du contact (= résumé erroné).
    const queue = await fetchBatchQueue(config.airtableToken, config.baseId, config.tableId,
      maxCount, config.batchFormula, config.cf);
    const cf = config.cf;
    batchState.total = queue.length;

    if (queue.length === 0) {
      batchLog('✅ Aucun contact à enrichir (tous déjà enrichis et cohérents).');
      return;
    }
    batchLog(`📋 ${queue.length} contact(s) à traiter. Pause de ${delayMs / 1000}s entre chacun.`);

    for (let i = 0; i < queue.length; i++) {
      if (batchState.stopRequested) { batchLog('⏹️ Arrêt demandé par l\'utilisateur.'); break; }

      const record = queue[i];
      batchState.current = i + 1;
      batchState.currentName = record.fields[cf.profileName] || record.fields[cf.linkedinUrl] || '?';
      // Distingue les fiches jamais enrichies des résumés incohérents (corruption)
      const hadSummary = !!(record.fields[cf.profileSummary] || '').trim();
      const reason = hadSummary ? '⚠️ résumé incohérent' : 'nouveau';
      batchLog(`(${i + 1}/${queue.length}) 🔗 Scraping : ${batchState.currentName} (${reason})…`);

      try {
        const r = await enrichOneRecord(record, config);
        batchState.ok++;
        batchLog(`(${i + 1}/${queue.length}) ✅ ${r.name} — page: ${r.rawLen}c, ${r.expCount} exp, résumé ${r.sumLen}c`);
      } catch (e) {
        batchState.failed++;
        batchState.lastError = e.message;
        batchLog(`(${i + 1}/${queue.length}) ❌ ${batchState.currentName} — ${e.message}`);
      }

      if (i < queue.length - 1 && !batchState.stopRequested) {
        batchLog(`⏳ Pause ${delayMs / 1000}s avant le suivant…`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    batchLog(`🏁 Terminé : ${batchState.ok} réussi(s), ${batchState.failed} échec(s).`);
  } catch (e) {
    batchLog(`💥 Erreur fatale : ${e.message}`);
  } finally {
    batchState.running = false;
    batchState.currentName = '';
    stopKeepAlive();
    notifyBatch();
  }
}

// =============================================================
// ─── ÉCOUTE DES MESSAGES CHROME ─────────────────────────────
// =============================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // ── Profil ─────────────────────────────────────────────────
  if (msg.type === 'PROCESS_PROFILE') {
    handleProcessProfile(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Entreprise ─────────────────────────────────────────────
  if (msg.type === 'PROCESS_COMPANY') {
    handleProcessCompany(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Upload PDF profil ──────────────────────────────────────
  if (msg.type === 'UPLOAD_PDF') {
    (async () => {
      try {
        const config = await loadConfig();
        const pdfField = config.cf.profilePdf;
        if (!pdfField) { sendResponse({ success: true }); return; } // champ absent dans cette base
        const fileName = msg.pdfName ? `linkedin_${msg.pdfName}_${Date.now()}.pdf` : `linkedin_${Date.now()}.pdf`;
        await uploadAttachment(config.airtableToken, config.baseId, config.tableId,
          msg.recordId, pdfField, fileName, msg.pdfBase64, 'application/pdf');
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ── Upload PDF entreprise ──────────────────────────────────
  if (msg.type === 'UPLOAD_COMPANY_PDF') {
    (async () => {
      try {
        const config = await loadConfig();
        const pdfField = config.cpf.profilePdf;
        if (!pdfField) { sendResponse({ success: true }); return; } // champ absent dans cette base
        await uploadAttachment(config.airtableToken, config.baseId, config.companyTableId,
          msg.recordId, pdfField, `company_${Date.now()}.pdf`, msg.pdfBase64, 'application/pdf');
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ── Image (CORS bypass) ────────────────────────────────────
  if (msg.type === 'FETCH_IMAGE') {
    fetchImageAsBase64(msg.url).then(sendResponse);
    return true;
  }

  // ── Post LinkedIn ──────────────────────────────────────────
  if (msg.type === 'CAPTURE_POST') {
    handleCapturePost(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Feature D : statut prospection ─────────────────────────
  if (msg.type === 'UPDATE_PROSPECT_STATUS') {
    handleUpdateProspectStatus(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Feature E : relance ────────────────────────────────────
  if (msg.type === 'SET_RELANCE') {
    handleSetRelance(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Feature A : doublon ────────────────────────────────────
  if (msg.type === 'CHECK_EXISTING') {
    handleCheckExisting(msg)
      .then(sendResponse)
      .catch(() => sendResponse({ exists: false }));
    return true;
  }

  // ── Feature B : contacts entreprise ────────────────────────
  if (msg.type === 'GET_COMPANY_CONTACTS') {
    handleGetCompanyContacts(msg)
      .then(sendResponse)
      .catch(() => sendResponse({ contacts: [] }));
    return true;
  }

  // ── Batch : démarrage ──────────────────────────────────────
  if (msg.action === 'startBatch') {
    runBatch(msg.config);
    sendResponse({ success: true });
    return false;
  }

  // ── Batch : arrêt ─────────────────────────────────────────
  if (msg.action === 'stopBatch') {
    batchState.stopRequested = true;
    sendResponse({ success: true });
    return false;
  }

  // ── Batch : statut ────────────────────────────────────────
  if (msg.action === 'getBatchStatus') {
    sendResponse({
      running: batchState.running,
      current: batchState.current,
      total: batchState.total,
      ok: batchState.ok,
      failed: batchState.failed,
      currentName: batchState.currentName,
      logs: batchState.logs.slice(-12),
    });
    return false;
  }

});
