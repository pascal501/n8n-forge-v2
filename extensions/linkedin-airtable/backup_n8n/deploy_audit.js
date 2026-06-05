const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\audit_porteC.json", "utf8");
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };
(async () => {
  const r = await fetch("https://usine.dinaou.com/api/v1/workflows", { method: "POST", headers: H, body });
  const j = await r.json();
  if (!r.ok) { console.log("ERREUR:", r.status, JSON.stringify(j).slice(0, 400)); return; }
  const id = (j.data || j).id;
  console.log("✅ Audit Porte C créé. id =", id);
  const g = await (await fetch("https://usine.dinaou.com/api/v1/workflows/" + id, { headers: H })).json();
  const wf = g.data || g;
  const hasWrite = wf.nodes.some(n => n.type === "n8n-nodes-base.airtable" && ["upsert", "update", "create"].includes(n.parameters.operation));
  console.log("nœuds :", wf.nodes.map(n => n.name).join(" → "));
  console.log("écriture ? :", hasWrite ? "⚠️ OUI" : "NON (lecture seule ✅)");
})();
