const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const list = await (await fetch("https://usine.dinaou.com/api/v1/executions?workflowId=pWVSPuSket8Q6F6Q&limit=1&includeData=true", { headers: H })).json();
  if (!list.data || !list.data.length) { console.log("aucune exécution encore"); return; }
  const ex = list.data[0];
  console.log("Status:", ex.status);
  const rd = ex.data.resultData.runData;
  for (const [name, runs] of Object.entries(rd)) { if (runs[0].error) console.log("❌", name, ":", runs[0].error.message); }
  const out = rd["Audit Porte C"][0].data.main[0][0].json;
  console.log("\n=== AUDIT PORTE C ===");
  for (const [k, v] of Object.entries(out)) {
    if (k === "C2_exemples") { console.log("\nExemples C2 (à incuber):\n  " + v.split(" | ").join("\n  ")); }
    else console.log(k.padEnd(52) + " : " + v);
  }
})();
