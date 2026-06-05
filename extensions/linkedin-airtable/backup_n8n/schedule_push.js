// Met à jour le push (trigger nocturne 05h) + l'active.
const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\push_workflow.json", "utf8");
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };
const ID = "MxSPqRuyxfSeHsPF";
(async () => {
  const r = await fetch("https://usine.dinaou.com/api/v1/workflows/" + ID, { method: "PUT", headers: H, body });
  console.log("PUT status:", r.status);
  if (!r.ok) { console.log((await r.text()).slice(0, 300)); return; }
  const a = await fetch("https://usine.dinaou.com/api/v1/workflows/" + ID + "/activate", { method: "POST", headers: H, body: "{}" });
  const aj = await a.json();
  const wf = aj.data || aj;
  console.log("Activé :", wf.active, "| trigger :", wf.nodes.find(n => n.type.includes("Trigger")).name);
})();
