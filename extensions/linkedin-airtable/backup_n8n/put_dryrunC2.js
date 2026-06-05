const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\dryrun_C2.json", "utf8");
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };
const ID = "x29R1Wkv2fm9AjZ5";
(async () => {
  const r = await fetch("https://usine.dinaou.com/api/v1/workflows/" + ID, { method: "PUT", headers: H, body });
  console.log("PUT:", r.status);
  if (!r.ok) { console.log((await r.text()).slice(0, 300)); return; }
  const wf = (await (await fetch("https://usine.dinaou.com/api/v1/workflows/" + ID, { headers: H })).json()).data;
  console.log("nœuds avec réessai :", wf.nodes.filter(x => x.retryOnFail).length, "/ 3");
})();
