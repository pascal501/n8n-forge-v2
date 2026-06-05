// Proto : Gemini classe une entreprise (ESN / Cabinet / Intérim / Client final) via grounding.
const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.gemini_api_key", "utf8").trim();

// Cas représentatifs : ESN, recrutement, intérim, vrais clients, edge cases
const tests = [
  { nom: "Capgemini", ville: "Paris", naf: "70.10Z" },          // ESN (piège : NAF holding)
  { nom: "Davidson Consulting", ville: "Boulogne", naf: "71.12B" }, // ESN (piège)
  { nom: "Grafton", ville: "Pouxeux", naf: "47.99B" },          // recrutement/intérim
  { nom: "Actual ITS", ville: "Laval", naf: "70.10Z" },         // intérim/ESN
  { nom: "Fidal", ville: "Courbevoie", naf: "69.10Z" },         // cabinet avocats (à exclure)
  { nom: "Cailabs", ville: "Rennes", naf: "" },                 // vrai client (deeptech)
  { nom: "Lactalis", ville: "Laval", naf: "" },                 // vrai client (agro)
  { nom: "Forums Talents Handicap", ville: "Rennes", naf: "" }, // événementiel (à exclure)
];

async function classify(c) {
  const prompt =
    `Entreprise française : « ${c.nom} »` + (c.ville ? ` (${c.ville})` : "") + (c.naf ? `, code NAF ${c.naf}` : "") + `. ` +
    `Distingue les INTERMÉDIAIRES de services — ESN/SSII, conseil en ingénierie & assistance technique, ` +
    `cabinet de recrutement, agence d'intérim/emploi, portage salarial (ils vendent ou placent des consultants/candidats) — ` +
    `des CLIENTS FINAUX (toute autre organisation qui consomme de l'IT pour son propre compte). ` +
    `Réponds UNIQUEMENT par un mot : ESN, RECRUTEMENT, INTERIM, CLIENT, ou AUTRE. ` +
    `Au moindre doute qu'il s'agit d'un intermédiaire de services ou de recrutement, ne réponds PAS CLIENT.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
  });
  const j = await r.json();
  const txt = (j.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ") || "").trim();
  const m = txt.toUpperCase().match(/CLIENT|RECRUTEMENT|INTERIM|ESN|AUTRE/);
  return m ? m[0] : "(?) " + txt.slice(0, 40);
}

(async () => {
  for (const c of tests) {
    try { console.log(`${(await classify(c)).padEnd(12)} ← ${c.nom}`); }
    catch (e) { console.log(`ERR ${c.nom}: ${e.message}`); }
  }
})();
