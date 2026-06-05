const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const list = await (await fetch("https://usine.dinaou.com/api/v1/executions?workflowId=77qJROlpJy71gHgS&limit=1&includeData=true", { headers: H })).json();
  if (!list.data || !list.data.length) { console.log("PAS_ENCORE"); return; }
  const ex = list.data[0];
  if (ex.status !== "success") { console.log("Status:", ex.status); }
  const rd = ex.data.resultData.runData;
  for (const [name, runs] of Object.entries(rd)) { if (runs[0].error) console.log("❌", name, ":", runs[0].error.message); }
  const rows = rd["Dry-run liens C1"][0].data.main[0];
  console.log("=== DRY-RUN LIENS C1 (" + (rows.length - 1) + " paires) ===");
  for (const it of rows) {
    const j = it.json;
    if (j.contact.startsWith("===")) { console.log(j.contact); continue; }
    console.log("  " + (j.contact || "").padEnd(28) + " | " + (j.employeur_texte || "").padEnd(28) + " → " + j.company);
  }
})();
