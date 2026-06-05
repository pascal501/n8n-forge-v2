// PUT propre du moteur v2 (UTF-8 natif) + vérification immédiate.
const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const key = fs.readFileSync(base + "\\.n8n_api_key", "utf8").trim();
const body = fs.readFileSync(dir + "\\adzuna_v2_minimal.json", "utf8");
const WID = "d2VB04ISTfbj2cmN";
const API = "https://usine.dinaou.com/api/v1/workflows/" + WID;
const H = { "X-N8N-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json; charset=utf-8" };

(async () => {
  // 1) PUT
  const put = await fetch(API, { method: "PUT", headers: H, body });
  console.log("PUT status:", put.status);
  if (!put.ok) { console.log("PUT body:", (await put.text()).slice(0, 300)); return; }

  // 2) GET pour vérifier
  const get = await fetch(API, { headers: H });
  const data = (await get.json()).data || (await get.json());
  // refetch propre
  const g2 = await (await fetch(API, { headers: H })).json();
  const wf = g2.data || g2;
  const adz = wf.nodes.find(n => n.name === "Adzuna enrichissement classement");
  const code = adz ? adz.parameters.jsCode : "";
  console.log("--- Vérif code Adzuna déployé ---");
  console.log("'Département' présent :", code.includes("Département"));
  console.log("'Assigné à' présent  :", code.includes("Assigné à"));
  console.log("'Grande Région' présent :", code.includes("Grande Région"));
  console.log("Ancien 'Departement' (sans accent) :", code.includes("'Departement'"));
  // Montre la ligne de sortie
  const m = code.match(/out\.push\(\{ json: \{[^}]+/);
  if (m) console.log("\nLigne sortie:", m[0].slice(0, 200));
})();
