const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const API = "https://usine.dinaou.com/api/v1/workflows/d2VB04ISTfbj2cmN";
(async () => {
  const r = await fetch(API, { headers: { "X-N8N-API-KEY": key, "Accept": "application/json" } });
  const j = await r.json();
  const wf = j.data || j;
  const adz = wf.nodes.find(n => n.name === "Adzuna enrichissement classement").parameters.jsCode;
  const gem = wf.nodes.find(n => n.name === "Gemini : enrichissement LinkedIn").parameters.jsCode;
  console.log("=== Adzuna ===");
  console.log("  accents 'Département' :", adz.includes("Département"));
  console.log("  dédoublonnage         :", adz.includes("return dedup;"));
  console.log("=== Gemini ===");
  console.log("  lit f.fields.Entreprise :", gem.includes("f.fields || f"));
  console.log("  timeout 15000           :", gem.includes("timeout: 15000"));
})();
