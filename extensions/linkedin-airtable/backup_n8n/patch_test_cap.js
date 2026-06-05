// Crée une version de TEST du workflow Localisation : plafonne le filtre à 5 contacts.
const fs = require("fs");
const dir = "\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\_n8n_backup";

const wf = JSON.parse(fs.readFileSync(dir + "\\localisation_put.json", "utf8"));
const filterNode = wf.nodes.find(n => n.name === "Filtre sans Location");

// Injecte un plafond de 5 juste avant le return final
filterNode.parameters.jsCode = filterNode.parameters.jsCode.replace(
  "return out;",
  "return out.slice(0, 5);   // ⚠️ PLAFOND DE TEST — à retirer ensuite"
);

fs.writeFileSync(dir + "\\localisation_put_test.json", JSON.stringify(wf, null, 2), "utf8");
console.log("OK — version de test plafonnée à 5 créée.");
