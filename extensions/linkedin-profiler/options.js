// options.js — sauvegarde et chargement de la config multi-bases

'use strict';

const FIELDS = [
  'airtableToken', 'geminiKey', 'openrouterKey',
  'lcm_baseId', 'lcm_contactsTableId', 'lcm_companiesTableId', 'lcm_jobsTableId',
  'clients_baseId', 'clients_contactsTableId', 'clients_companiesTableId',
  'batchDelay', 'batchMax',
];

document.addEventListener('DOMContentLoaded', () => {
  // Charge les valeurs existantes
  chrome.storage.sync.get(FIELDS, (data) => {
    FIELDS.forEach((f) => {
      const el = document.getElementById(f);
      if (el && data[f]) el.value = data[f];
    });
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const vals = {};
    for (const f of FIELDS) {
      const el = document.getElementById(f);
      if (!el) continue;
      vals[f] = (el.type === 'number')
        ? (parseInt(el.value, 10) || '')
        : el.value.trim();
    }

    // Bornes de sécurité batch
    if (vals.batchDelay) vals.batchDelay = Math.min(600, Math.max(10, vals.batchDelay));
    if (vals.batchMax)   vals.batchMax   = Math.min(300, Math.max(1, vals.batchMax));

    const status = document.getElementById('status');

    if (!vals.airtableToken) {
      status.textContent = 'Le token Airtable est requis.';
      status.className = 'error';
      return;
    }

    // Au moins une base complète (Base ID + Table Contacts)
    const hasLcm     = vals.lcm_baseId && vals.lcm_contactsTableId;
    const hasClients = vals.clients_baseId && vals.clients_contactsTableId;
    if (!hasLcm && !hasClients) {
      status.textContent = 'Configurez au moins une base (Base ID + Table Contacts).';
      status.className = 'error';
      return;
    }

    chrome.storage.sync.set(vals, () => {
      status.textContent = '✓ Paramètres enregistrés';
      status.className = 'success';
      setTimeout(() => { status.className = ''; status.textContent = ''; }, 3000);
    });
  });
});
