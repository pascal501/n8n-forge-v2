const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const API = "https://usine.dinaou.com/api/v1/workflows/AlrmjXJb3OxUYfCA";
(async () => {
  const j = await (await fetch(API, { headers: { "X-N8N-API-KEY": key } })).json();
  const wf = j.data || j;
  const gem = wf.nodes.find(n => n.name === "Gemini : page LinkedIn").parameters.jsCode;
  console.log("plafond MAX_PAR_RUN = 18 :", gem.includes("MAX_PAR_RUN = 18"));
  console.log("timeout 12000           :", gem.includes("timeout: 12000"));
  console.log("accents prompt « Réponds » :", gem.includes("Réponds UNIQUEMENT"));
  console.log("guillemets français «  » :", gem.includes("« ") && gem.includes(" »"));
})();
