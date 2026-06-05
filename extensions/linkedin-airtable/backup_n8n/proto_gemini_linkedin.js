// Prototype : trouver la page LinkedIn d'une entreprise via Gemini 2.5 Flash + grounding.
const fs = require("fs");
const key = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\.gemini_api_key", "utf8").trim();

const companies = [
  { nom: "Crédit Agricole d'Ille-et-Vilaine", ville: "Rennes" },
  { nom: "Samsic", ville: "Rennes" },
  { nom: "AS24 (TotalEnergies)", ville: "Nantes" },
  { nom: "Cailabs", ville: "Rennes" },
  { nom: "Système U (site de Carquefou)", ville: "Carquefou" },
];

// Nettoie le nom : retire les parenthèses parasites pour la recherche
function cleanName(n) {
  return n.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

async function findLinkedIn(company) {
  const clean = cleanName(company.nom);
  const prompt =
    `Quelle est l'URL exacte de la page LinkedIn officielle de l'entreprise « ${clean} » ` +
    `(située à ${company.ville}, France) ? ` +
    `Réponds UNIQUEMENT par l'URL au format https://www.linkedin.com/company/... ` +
    `Si tu n'es pas certain à 100% que c'est la bonne entreprise, réponds exactement: AUCUNE. ` +
    `Aucun autre texte.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],          // grounding = recherche web réelle
      generationConfig: { temperature: 0 },
    }),
  });
  const json = await resp.json();
  if (!resp.ok) return { raw: "ERREUR HTTP " + resp.status + ": " + (json.error?.message || ""), url: "" };

  const txt = (json.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ") || "").trim();
  // Extrait une URL linkedin.com/company/...
  const m = txt.match(/https?:\/\/[a-z.]*linkedin\.com\/company\/[^\s)"']+/i);
  return { raw: txt.slice(0, 120), url: m ? m[0].replace(/[).,]+$/, "") : "" };
}

(async () => {
  for (const c of companies) {
    try {
      const r = await findLinkedIn(c);
      console.log(`\n● ${c.nom}`);
      console.log(`   URL extraite : ${r.url || "(aucune)"}`);
      console.log(`   Réponse brute: ${r.raw}`);
    } catch (e) {
      console.log(`\n● ${c.nom}  → EXCEPTION: ${e.message}`);
    }
  }
})();
