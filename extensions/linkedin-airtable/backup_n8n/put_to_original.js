// Met le code v1 simple corrigé dans le workflow ORIGINAL (XcKZyOGhVfqEtd5O),
// puis désactive le doublon (d2VB04ISTfbj2cmN).
const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\adzuna_v1_simple.json", "utf8");
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };
const ORIG = "https://usine.dinaou.com/api/v1/workflows/XcKZyOGhVfqEtd5O";
const DUP = "https://usine.dinaou.com/api/v1/workflows/d2VB04ISTfbj2cmN";

(async () => {
  // 1) PUT le bon code dans l'original
  const put = await fetch(ORIG, { method: "PUT", headers: H, body });
  console.log("PUT original status:", put.status);
  if (!put.ok) { console.log((await put.text()).slice(0, 300)); return; }

  // 2) Vérifie accents + dédup dans l'original
  const wf = (await (await fetch(ORIG, { headers: H })).json()).data;
  const adz = wf.nodes.find(n => n.name === "Adzuna enrichissement classement").parameters.jsCode;
  console.log("  accents 'Département' :", adz.includes("Département"));
  console.log("  dédoublonnage         :", adz.includes("return dedup;"));
  console.log("  nœuds                 :", wf.nodes.length, "(pas de Gemini)");

  // 3) Désactive le doublon
  const deact = await fetch(DUP + "/deactivate", { method: "POST", headers: H });
  console.log("Désactivation doublon status:", deact.status);
})();
