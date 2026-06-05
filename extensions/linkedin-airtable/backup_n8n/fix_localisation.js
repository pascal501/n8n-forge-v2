// Répare le workflow Localisation : corrige le flux, capture les 2 réponses HTTP,
// historise dans Notes, ne touche que les Location vides. Écrit localisation_put.json.
const fs = require("fs");
const dir = "\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\_n8n_backup";

const wf = JSON.parse(fs.readFileSync(dir + "\\localisation.json", "utf8"));

// ── 1. Filtre : it.json (à plat), bons noms, porte record_id + Notes ──
const filterNode = wf.nodes.find(n => n.name === "Filtre sans Location");
filterNode.parameters.jsCode = `// Filtre contacts sans Location (corrigé : v2.1 = champs à plat)
const items = $input.all();
const out = [];
for (const it of items) {
  const f = it.json;
  const loc = (f.Location || '').toString().trim();
  if (loc) continue;                          // Priorité LinkedIn : on ne touche pas si déjà rempli
  const entreprise = (f['Entreprise'] || '').toString().trim();
  const prenom = (f['Prénom'] || '').toString().trim();
  const nom = (f['Nom'] || '').toString().trim();
  // Garde-fou : il faut au moins une entreprise (SIRENE) ou un nom complet (Apollo)
  if (!entreprise && !(prenom && nom)) continue;
  out.push({ json: {
    record_id: f.id,
    nom, prenom, entreprise,
    notes: (f['Notes'] || '').toString()
  }});
}
return out;
`;

// ── 2. Apollo : référencer le nom DEPUIS le filtre (SIRENE a remplacé l'item) ──
const apolloNode = wf.nodes.find(n => n.name === "HTTP : Apollo (fallback)");
const ap = apolloNode.parameters.queryParameters.parameters;
ap.find(p => p.name === "first_name").value = "={{ $('Filtre sans Location').item.json.prenom }}";
ap.find(p => p.name === "last_name").value  = "={{ $('Filtre sans Location').item.json.nom }}";
// Ne pas planter toute l'exécution si un appel échoue (nom/entreprise vide → 4xx)
apolloNode.onError = "continueRegularOutput";
const sireneNode = wf.nodes.find(n => n.name === "HTTP : SIRENE (adresse)");
sireneNode.onError = "continueRegularOutput";

// ── 3. Extrait location : recombine filtre + SIRENE + Apollo par index, + Notes ──
const extractNode = wf.nodes.find(n => n.name === "Code : Extrait location");
extractNode.parameters.jsCode = `// Recombine les 3 sources (filtre / SIRENE / Apollo) par index + historise Notes
const apollo = $input.all();                          // sortie Apollo (dernière HTTP)
const src = $('Filtre sans Location').all();          // record_id, entreprise, nom, notes
const sirene = $('HTTP : SIRENE (adresse)').all();    // réponse SIRENE
const out = [];

const regions_fr = {
  '35':'Bretagne','56':'Bretagne','22':'Bretagne','29':'Bretagne',
  '44':'Pays de la Loire','49':'Pays de la Loire','85':'Pays de la Loire','72':'Pays de la Loire'
};

for (let i = 0; i < src.length; i++) {
  const s = src[i].json;
  const sir = (sirene[i] && sirene[i].json) ? sirene[i].json : {};
  const apo = (apollo[i] && apollo[i].json) ? apollo[i].json : {};
  let location = '';
  let source = '';

  // SIRENE d'abord — UNIQUEMENT si on avait une entreprise (sinon résultat non fiable)
  if (s.entreprise && sir && Array.isArray(sir.results) && sir.results.length > 0) {
    const e = sir.results[0];
    if (e.siege && e.siege.libelle_commune) {
      location = e.siege.libelle_commune;                     // ville du siège (plus précis)
      source = 'SIRENE';
    } else if (e.siege && e.siege.code_postal) {
      location = regions_fr[String(e.siege.code_postal).substring(0,2)] || 'France';
      source = 'SIRENE';
    }
  }

  // Fallback Apollo (par nom) si SIRENE n'a rien donné
  if (!location && apo && Array.isArray(apo.people) && apo.people.length > 0) {
    const p = apo.people[0];
    location = p.city || p.state || p.country || '';
    if (location) source = 'Apollo';
  }

  if (!location) continue;                                    // rien de fiable → on n'écrit rien

  // Historisation Notes (même format que l'extension)
  const now = new Date();
  const d = now.toLocaleDateString('fr-FR');
  const t = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const entry = '📅 ' + d + ' ' + t + ' — ENRICHISSEMENT ' + source.toUpperCase() + ' (complément)\\n• Location: vide → ' + location + ' (via ' + source + ')';
  const prev = s.notes || '';
  const notes = prev ? (entry + '\\n\\n' + '─'.repeat(30) + '\\n\\n' + prev) : entry;

  out.push({ json: { id: s.record_id, Location: location, Notes: notes } });
}
return out;
`;

// ── 4. Update : ajoute "Notes" au schéma (pour qu'autoMap le laisse passer) ──
const updateNode = wf.nodes.find(n => n.name === "Airtable : Update Location");
const schema = updateNode.parameters.columns.schema;
if (!schema.find(c => c.id === "Notes")) {
  schema.push({
    id: "Notes", displayName: "Notes", required: false, defaultMatch: false,
    canBeUsedToMatch: true, display: true, type: "string", readOnly: false, removed: false,
  });
}

// ── Sauvegarde payload PUT épuré ──
const put = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: "v1" } };
fs.writeFileSync(dir + "\\localisation_put.json", JSON.stringify(put, null, 2), "utf8");
console.log("OK — workflow Localisation corrigé (" + wf.nodes.length + " nœuds).");
