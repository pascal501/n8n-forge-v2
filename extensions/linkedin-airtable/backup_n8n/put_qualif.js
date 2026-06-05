// Met à jour le workflow de qualification (lot 30) — PUT propre UTF-8.
const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\qualif_workflow.json", "utf8");
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };
const ID = "GmJnDUTIAdv5eCIQ";
(async () => {
  const r = await fetch("https://usine.dinaou.com/api/v1/workflows/" + ID, { method: "PUT", headers: H, body });
  console.log("PUT status:", r.status);
  if (!r.ok) { console.log((await r.text()).slice(0, 300)); return; }
  const wf = (await (await fetch("https://usine.dinaou.com/api/v1/workflows/" + ID, { headers: H })).json()).data;
  const gem = wf.nodes.find(n => n.name === "Gemini : qualification").parameters.jsCode;
  console.log("lot 30 :", gem.includes("MAX = 30"));
  console.log("accents:", gem.includes("Réponds UNIQUEMENT"), "| Intérim:", gem.includes("Intérim"));
})();
