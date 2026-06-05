const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const list = await (await fetch("https://usine.dinaou.com/api/v1/executions?workflowId=MxSPqRuyxfSeHsPF&limit=1&includeData=true", { headers: H })).json();
  if (!list.data || !list.data.length) { console.log("aucune exécution"); return; }
  const ex = list.data[0];
  console.log("Status:", ex.status);
  const rd = ex.data.resultData.runData;
  for (const [name, runs] of Object.entries(rd)) {
    const r = runs[0];
    if (r.error) { console.log("❌", name, ":", r.error.message); continue; }
    const cnt = (r.data && r.data.main && r.data.main[0]) ? r.data.main[0].length : 0;
    console.log("  " + name.padEnd(26) + " → " + cnt + " items");
  }
})();
