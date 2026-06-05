const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json" };
(async () => {
  const list = await (await fetch("https://usine.dinaou.com/api/v1/executions?workflowId=nrMgGBY3mXsyL5Cp&limit=1&includeData=true", { headers: H })).json();
  const ex = list.data[0];
  let d = ex.data;
  if (typeof d === "string") d = JSON.parse(d);
  const rd = d.resultData.runData;
  const rows = rd["Gemini : trouver URL"][0].data.main[0];
  const dist = { Haute: 0, Moyenne: 0, Faible: 0 };
  let withUrl = 0;
  console.log("Résultats Gemini (" + rows.length + " contacts traités) :\n");
  for (const it of rows) {
    const j = it.json;
    const u = j["LinkedIn URL (proposé)"] || "";
    const c = j["Confiance URL"] || "?";
    dist[c] = (dist[c] || 0) + 1;
    if (u) withUrl++;
    console.log("  [" + c + "] " + (u || "(vide)"));
  }
  console.log("\n--- Distribution ---");
  console.log("  Haute   :", dist.Haute);
  console.log("  Moyenne :", dist.Moyenne);
  console.log("  Faible  :", dist.Faible);
  console.log("  Avec URL:", withUrl, "/", rows.length);
})();
