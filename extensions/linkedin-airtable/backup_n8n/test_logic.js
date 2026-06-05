// Test local des 2 nœuds Code avec des données simulant la sortie réelle d'Airtable v2.1

// ── Simule la sortie du nœud Airtable search (champs à plat + id) ──
const airtableItems = [
  { json: { id: "rec001", "Prénom": "Mickaël", "Nom": "GUIHO", "Entreprise": "Orange",
            "Email": "", "Location": "Rennes, Bretagne, France", "Notes": "📅 ancienne entrée" } },
  { json: { id: "rec002", "Prénom": "Paul", "Nom": "MARTIN", "Entreprise": "Capgemini",
            "Email": "deja@rempli.com", "Location": "Rennes", "Notes": "" } },           // a déjà un email → skip
  { json: { id: "rec003", "Prénom": "Luc", "Nom": "DURAND", "Entreprise": "X",
            "Email": "", "Location": "Paris", "Notes": "" } },                            // pas Rennes/Nantes → skip
];

// ── NŒUD 1 : Filtre ──
function filterNode(items) {
  const out = [];
  const geo = ['rennes','bretagne','nantes','loire','pays de la loire','ille','vilaine','atlantique','morbihan','finistere','cotes-d'];
  for (const it of items) {
    const f = it.json;
    const email = (f.Email || '').toString().trim();
    if (email) continue;
    const loc = (f.Location || '').toString().toLowerCase();
    if (!geo.some(g => loc.indexOf(g) !== -1)) continue;
    out.push({ json: {
      id: f.id,
      prenom: (f['Prénom'] || '').toString().trim(),
      nom: (f['Nom'] || '').toString().trim(),
      entreprise: (f['Entreprise'] || '').toString().trim(),
      notes: (f['Notes'] || '').toString()
    }});
  }
  return out;
}

const filtered = filterNode(airtableItems);
console.log("=== Après filtre (attendu: 1 seul, rec001) ===");
console.log(JSON.stringify(filtered, null, 2));

// ── Simule la réponse Apollo (people/search) pour chaque item filtré ──
const apolloItems = filtered.map(f => ({
  json: { people: [{ email: f.json.nom === "GUIHO" ? "m.guiho@orange.com" : "" }] }
}));

// ── NŒUD 2 : Extrait email + Notes ──
function extractNode(apollo, src) {
  const out = [];
  for (let i = 0; i < apollo.length; i++) {
    const resp = apollo[i].json || {};
    const s = (src[i] && src[i].json) ? src[i].json : {};
    let email = '';
    if (Array.isArray(resp.people) && resp.people.length > 0) {
      const e = (resp.people[0].email || '').toString();
      if (e && !/not_unlocked|locked|email_not/i.test(e)) email = e;
    }
    if (!email) continue;
    const now = new Date();
    const d = now.toLocaleDateString('fr-FR');
    const t = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const entry = '📅 ' + d + ' ' + t + ' — ENRICHISSEMENT APOLLO (complément)\n• Email: vide → ' + email + ' (via Apollo)';
    const prev = s.notes || '';
    const notes = prev ? (entry + '\n\n' + '─'.repeat(30) + '\n\n' + prev) : entry;
    out.push({ json: { id: s.id, Email: email, Notes: notes } });
  }
  return out;
}

const result = extractNode(apolloItems, filtered);
console.log("\n=== Sortie finale vers Update (attendu: rec001 avec Email + Notes historisées) ===");
console.log(JSON.stringify(result, null, 2));
