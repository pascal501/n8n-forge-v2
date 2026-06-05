// Crée le workflow de qualification (UTF-8 propre) + vérifie accents.
const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\qualif_workflow.json", "utf8");
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };
(async () => {
  const r = await fetch("https://usine.dinaou.com/api/v1/workflows", { method: "POST", headers: H, body });
  const j = await r.json();
  if (!r.ok) { console.log("ERREUR POST:", r.status, JSON.stringify(j).slice(0, 300)); return; }
  const id = (j.data || j).id;
  console.log("✅ Créé. id =", id);
  // Vérifie accents
  const wf = (await (await fetch("https://usine.dinaou.com/api/v1/workflows/" + id, { headers: H })).json()).data;
  const gem = wf.nodes.find(n => n.name === "Gemini : qualification").parameters.jsCode;
  console.log("  accents « Réponds » :", gem.includes("Réponds UNIQUEMENT"));
  console.log("  Intérim (accent)    :", gem.includes("Intérim"));
  console.log("  batch 18            :", gem.includes("MAX = 18"));
})();
