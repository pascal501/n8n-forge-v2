// Transforme le workflow Email cassé en version fonctionnelle.
// Lit email.json (sauvegarde), corrige les nœuds, écrit email_new.json + payload PUT.
const fs = require("fs");
const dir = "\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\_n8n_backup";

const wf = JSON.parse(fs.readFileSync(dir + "\\email.json", "utf8"));

// ── 1. Nœud filtre : corrige l'accès aux champs (v2.1 = à plat) + porte id & Notes
const filterNode = wf.nodes.find(n => n.name === "Filtre Rennes/Nantes sans Email");
filterNode.parameters.jsCode = `// Filtre contacts Rennes/Nantes sans Email (corrigé : v2.1 renvoie les champs à plat)
const items = $input.all();
const out = [];
const geo = ['rennes','bretagne','nantes','loire','pays de la loire','ille','vilaine','atlantique','morbihan','finistere','cotes-d'];

for (const it of items) {
  const f = it.json;                          // Airtable v2.1 : champs à plat (f.Email, f['Prénom'], f.id)
  const email = (f.Email || '').toString().trim();
  if (email) continue;                        // Priorité LinkedIn : on ne touche pas si déjà rempli
  const loc = (f.Location || '').toString().toLowerCase();
  if (!geo.some(g => loc.indexOf(g) !== -1)) continue;
  out.push({ json: {
    id: f.id,                                 // record id (match Airtable)
    prenom: (f['Prénom'] || '').toString().trim(),
    nom: (f['Nom'] || '').toString().trim(),
    entreprise: (f['Entreprise'] || '').toString().trim(),
    notes: (f['Notes'] || '').toString()
  }});
}
return out;
`;

// ── 2. NOUVEAU nœud : extrait l'email Apollo + construit l'entrée Notes
const extractNode = {
  parameters: {
    jsCode: `// Extrait l'email Apollo + construit l'historique Notes (porte id & Notes via la source)
const apollo = $input.all();
const src = $('Filtre Rennes/Nantes sans Email').all();   // mêmes items, même ordre
const out = [];

for (let i = 0; i < apollo.length; i++) {
  const resp = apollo[i].json || {};
  const s = (src[i] && src[i].json) ? src[i].json : {};
  let email = '';
  if (Array.isArray(resp.people) && resp.people.length > 0) {
    const e = (resp.people[0].email || '').toString();
    if (e && !/not_unlocked|locked|email_not/i.test(e)) email = e;   // ignore les emails verrouillés
  }
  if (!email) continue;                        // pas d'email exploitable → on n'écrit rien
  const now = new Date();
  const d = now.toLocaleDateString('fr-FR');
  const t = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const entry = '📅 ' + d + ' ' + t + ' — ENRICHISSEMENT APOLLO (complément)\\n• Email: vide → ' + email + ' (via Apollo)';
  const prev = s.notes || '';
  const notes = prev ? (entry + '\\n\\n' + '─'.repeat(30) + '\\n\\n' + prev) : entry;
  out.push({ json: { id: s.id, Email: email, Notes: notes } });
}
return out;
`
  },
  id: "c0de0001-aaaa-4bbb-8ccc-000000000001",
  name: "Extrait email + Notes",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1384, 160],
};
wf.nodes.push(extractNode);

// ── 3. Décale l'Update et ajoute "Notes" à son schéma (pour qu'autoMap le laisse passer)
const updateNode = wf.nodes.find(n => n.name === "Airtable : Update Email");
updateNode.position = [1632, 160];
const schema = updateNode.parameters.columns.schema;
if (!schema.find(c => c.id === "Notes")) {
  schema.push({
    id: "Notes", displayName: "Notes", required: false, defaultMatch: false,
    canBeUsedToMatch: true, display: true, type: "string", readOnly: false, removed: false,
  });
}

// ── 4. Reconnecte : Apollo → Extrait → Update (au lieu de Apollo → Update)
wf.connections["HTTP : Apollo (email)"].main[0] = [
  { node: "Extrait email + Notes", type: "main", index: 0 },
];
wf.connections["Extrait email + Notes"] = {
  main: [[{ node: "Airtable : Update Email", type: "main", index: 0 }]],
};

// ── Sauvegarde la version complète + le payload PUT épuré
fs.writeFileSync(dir + "\\email_new.json", JSON.stringify(wf, null, 2), "utf8");
const putPayload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
fs.writeFileSync(dir + "\\email_put.json", JSON.stringify(putPayload, null, 2), "utf8");

console.log("OK — " + wf.nodes.length + " nœuds. Connexions Apollo→Extrait→Update posées.");
