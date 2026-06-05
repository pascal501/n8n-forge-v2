const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.n8n_api_key", "utf8").trim();
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
const ORIG = "https://usine.dinaou.com/api/v1/workflows/XcKZyOGhVfqEtd5O";
const DUP = "https://usine.dinaou.com/api/v1/workflows/d2VB04ISTfbj2cmN";
(async () => {
  const j = await (await fetch(ORIG, { headers: H })).json();
  const wf = j.data || j;
  const adz = wf.nodes.find(n => n.name === "Adzuna enrichissement classement").parameters.jsCode;
  console.log("=== Original XcKZyOGhVfqEtd5O ===");
  console.log("  accents 'Département' :", adz.includes("Département"));
  console.log("  dédoublonnage         :", adz.includes("return dedup;"));
  console.log("  nb nœuds (pas Gemini) :", wf.nodes.length);
  console.log("  actif                 :", wf.active);
  // Désactive le doublon
  const d = await fetch(DUP + "/deactivate", { method: "POST", headers: H });
  console.log("\nDésactivation doublon d2VB04ISTfbj2cmN :", d.status === 200 ? "OK" : d.status);
})();
