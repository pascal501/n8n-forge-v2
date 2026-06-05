const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const list = await (await fetch("https://usine.dinaou.com/api/v1/executions?workflowId=LNovkOC1mFqNqL6P&limit=1&includeData=true", { headers: H })).json();
  if (!list.data || !list.data.length) { console.log("aucune exécution"); return; }
  const ex = list.data[0];
  const rd = ex.data.resultData.runData;
  // erreurs par nœud
  for (const [name, runs] of Object.entries(rd)) {
    const r = runs[0];
    if (r.error) console.log("❌", name, ":", r.error.message);
  }
  const report = rd["Dry-run rapprochement"][0].data.main[0];
  console.log("\n=== RAPPORT DRY-RUN (" + report.length + " lignes) ===");
  for (const it of report) {
    const j = it.json;
    let l = j.decision.padEnd(14) + " | " + j.cible;
    if (j.company_existante) l += "  →  " + j.company_existante + " (par " + j.matche_par + ")";
    console.log(l);
    if (j.decision === "MATCH" && j.champs_a_remplir) console.log("                 remplir: " + j.champs_a_remplir);
  }
})();
