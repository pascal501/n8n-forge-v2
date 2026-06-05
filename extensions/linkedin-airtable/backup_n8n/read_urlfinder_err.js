const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const list = await (await fetch("https://usine.dinaou.com/api/v1/executions?workflowId=nrMgGBY3mXsyL5Cp&limit=1&includeData=true", { headers: H })).json();
  if (!list.data || !list.data.length) { console.log("PAS_ENCORE"); return; }
  const ex = list.data[0];
  console.log("status:", ex.status);
  const rd = ex.data.resultData.runData;
  for (const [name, runs] of Object.entries(rd)) {
    const e = runs[0] && runs[0].error;
    if (e) {
      console.log("\n❌ NODE:", name);
      console.log("  message:", e.message);
      if (e.description) console.log("  description:", e.description);
      if (e.stack) console.log("  stack:", String(e.stack).split("\n").slice(0, 4).join("\n"));
      if (e.context) console.log("  context:", JSON.stringify(e.context).slice(0, 300));
    }
  }
  if (ex.data.resultData.error) {
    console.log("\nTOP error:", ex.data.resultData.error.message);
  }
})();
