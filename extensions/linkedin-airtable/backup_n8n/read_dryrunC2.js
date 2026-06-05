const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const list = await (await fetch("https://usine.dinaou.com/api/v1/executions?workflowId=x29R1Wkv2fm9AjZ5&limit=1&includeData=true", { headers: H })).json();
  if (!list.data || !list.data.length) { console.log("PAS_ENCORE"); return; }
  const ex = list.data[0];
  if (ex.status !== "success") { console.log("Status:", ex.status); }
  const rd = ex.data.resultData.runData;
  for (const [name, runs] of Object.entries(rd)) { if (runs[0].error) console.log("❌", name, ":", runs[0].error.message); }
  const rows = rd["Dry-run incubation C2"][0].data.main[0];
  const inc = [], sus = [], dup = [];
  for (const it of rows) {
    const j = it.json;
    if (j.employeur.startsWith("===")) { console.log(j.employeur, "→", j.statut); continue; }
    if (j.statut === "A INCUBER") inc.push(j.employeur);
    else if (j.statut.startsWith("SUSPECT")) sus.push(j.employeur);
    else dup.push(j.employeur);
  }
  console.log("\n--- A INCUBER (" + inc.length + ") ---\n  " + inc.join("\n  "));
  console.log("\n--- SUSPECTS (" + sus.length + ") ---\n  " + sus.join("\n  "));
  console.log("\n--- DEJA en Cibles (" + dup.length + ") ---\n  " + dup.join("\n  "));
})();
