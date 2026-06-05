const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\push_workflow.json", "utf8");
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };
(async () => {
  const r = await fetch("https://usine.dinaou.com/api/v1/workflows", { method: "POST", headers: H, body });
  const j = await r.json();
  if (!r.ok) { console.log("ERREUR:", r.status, JSON.stringify(j).slice(0, 400)); return; }
  const id = (j.data || j).id;
  console.log("✅ PUSH créé. id =", id);
  const g = await (await fetch("https://usine.dinaou.com/api/v1/workflows/" + id, { headers: H })).json();
  const wf = g.data || g;
  console.log("nœuds :", wf.nodes.map(n => n.name).join(", "));
  const create = wf.nodes.find(n => n.name === "Companies : Créer");
  const update = wf.nodes.find(n => n.name === "Companies : Compléter");
  console.log("Créer  : op =", create.parameters.operation, "| base CLIENTS =", create.parameters.base.value === "appjbx1NZYVRvRqKR");
  console.log("Compléter : op =", update.parameters.operation, "| match =", JSON.stringify(update.parameters.columns.matchingColumns));
  const m = wf.nodes.find(n => n.name === "Matcher push").parameters.jsCode;
  console.log("garde ville (dept/Autre) :", m.includes("villeRaw.toLowerCase() !== 'autre'"));
  console.log("anti-écrasement (fill empty) :", m.includes("if (Object.keys(fields).length === 0) continue;"));
})();
