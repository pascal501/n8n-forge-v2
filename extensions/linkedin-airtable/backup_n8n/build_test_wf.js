// Construit un mini-workflow de test : Manual Trigger → Code → Update Airtable
// Réutilise la config EXACTE du nœud Update de prod (credential, autoMap, schema+Notes).
const fs = require("fs");
const dir = "\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\_n8n_backup";

const email = JSON.parse(fs.readFileSync(dir + "\\email_new.json", "utf8"));
const updateNode = JSON.parse(JSON.stringify(email.nodes.find(n => n.name === "Airtable : Update Email")));
updateNode.name = "Update (test)";
updateNode.position = [760, 200];
updateNode.id = "c0de0002-bbbb-4ccc-8ddd-000000000002";

const trigger = {
  parameters: {}, id: "c0de0003-cccc-4ddd-8eee-000000000003",
  name: "Trigger manuel", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [280, 200],
};

const code = {
  parameters: {
    jsCode: `// Émet l'item final {id, Email, Notes} pour le record de test (preuve d'écriture)
const now = new Date();
const d = now.toLocaleDateString('fr-FR');
const t = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const entry = '📅 ' + d + ' ' + t + ' — ENRICHISSEMENT APOLLO (complément)\\n• Email: vide → preuve@enrichissement-test.com (via Apollo)';
const prev = '📅 note initiale de test (doit être préservée)';
const notes = entry + '\\n\\n' + '─'.repeat(30) + '\\n\\n' + prev;
return [{ json: { id: 'rec3zI6vBaFjfOJKl', Email: 'preuve@enrichissement-test.com', Notes: notes } }];
`
  },
  id: "c0de0004-dddd-4eee-8fff-000000000004",
  name: "Émet item test", type: "n8n-nodes-base.code", typeVersion: 2, position: [520, 200],
};

const testWf = {
  name: "ZZ TEST - Preuve écriture Email+Notes (à supprimer)",
  nodes: [trigger, code, updateNode],
  connections: {
    "Trigger manuel": { main: [[{ node: "Émet item test", type: "main", index: 0 }]] },
    "Émet item test": { main: [[{ node: "Update (test)", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

fs.writeFileSync(dir + "\\test_wf_put.json", JSON.stringify(testWf, null, 2), "utf8");
console.log("OK — workflow de test construit (3 nœuds).");
