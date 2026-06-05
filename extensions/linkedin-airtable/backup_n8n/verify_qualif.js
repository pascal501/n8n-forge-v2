const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
(async () => {
  const j = await (await fetch("https://usine.dinaou.com/api/v1/workflows/GmJnDUTIAdv5eCIQ", { headers: { "X-N8N-API-KEY": key } })).json();
  const wf = j.data || j;
  const gem = wf.nodes.find(n => n.name === "Gemini : qualification").parameters.jsCode;
  console.log("accents « Réponds »  :", gem.includes("Réponds UNIQUEMENT"));
  console.log("Intérim (accent)     :", gem.includes("Intérim"));
  console.log("Client final (map)   :", gem.includes("Client final"));
  console.log("batch 18             :", gem.includes("MAX = 18"));
  console.log("nœuds                :", wf.nodes.map(n => n.name).join(" → "));
})();
