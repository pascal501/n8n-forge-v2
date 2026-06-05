const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const g = await (await fetch("https://usine.dinaou.com/api/v1/workflows/GmJnDUTIAdv5eCIQ", { headers: H })).json();
  const wf = g.data || g;
  const n = wf.nodes.find(x => x.name === "Gemini : qualification");
  console.log(n.parameters.jsCode);
  console.log("\n\n===== Update Qualif node params =====");
  const u = wf.nodes.find(x => x.name === "Airtable : Update Qualif");
  console.log(JSON.stringify(u.parameters, null, 1).slice(0, 1200));
})();
