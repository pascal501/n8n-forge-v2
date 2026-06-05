const fs = require("fs");
const envTxt = fs.readFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\.env", "utf8");
const m = envTxt.match(/^GEMINI_API_KEY=(.+)$/m);
const GKEY = m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
if (!GKEY) { console.log("Clé introuvable"); process.exit(1); }
console.log("Clé chargée (longueur " + GKEY.length + ").\n");

const people = [
  { full: "Clément Thubert", comp: "Ouest France", poste: "SIC" },
  { full: "Claude Le Goff", comp: "Viaccess-Orca", poste: "Senior Director Components Security" },
  { full: "Laurent Bouillot", comp: "SIRADEL", poste: "DG" },
  { full: "Cédric Hardouin", comp: "Viaccess-Orca", poste: "Executive Vice President of Research & Development" },
  { full: "Stéphanie Pouliquen", comp: "Cityzen", poste: "DP Solutions Territoire" },
  { full: "Nathalie Secher", comp: "Cityzen", poste: "DG" }
];

async function ask(p, variant) {
  let prompt;
  if (variant === "strict") {
    prompt = "Trouve l'URL exacte du profil LinkedIn de cette personne précise.\n" +
      "Nom: " + p.full + "\nEntreprise: " + p.comp + "\nPoste: " + p.poste + "\n" +
      "Cherche sur le web (site:linkedin.com/in). Si tu n'es pas certain, mets confiance 'faible'.\n" +
      'Réponds STRICTEMENT en JSON: {"url":"...","confiance":"haute|moyenne|faible"}. Si aucun: {"url":"","confiance":"faible"}.';
  } else {
    prompt = "Recherche sur le web le profil LinkedIn de : " + p.full + ", " + p.poste + " chez " + p.comp + " (France).\n" +
      "Donne TOUJOURS l'URL du meilleur candidat trouvé (forme https://www.linkedin.com/in/... ou https://fr.linkedin.com/in/...), même si tu n'es pas totalement sûr — gradue par la confiance.\n" +
      "confiance: 'haute' si entreprise OU poste correspond clairement ; 'moyenne' si nom+région plausibles ; 'faible' si simple homonyme possible.\n" +
      'Réponds en JSON sur une ligne: {"url":"...","confiance":"haute|moyenne|faible"}. URL vide seulement si vraiment aucun profil.';
  }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(GKEY), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } })
  });
  const j = await r.json();
  if (j.error) return "API_ERR: " + j.error.message;
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const txt = parts.map(x => x.text || "").join(" ").trim();
  const gm = j.candidates && j.candidates[0] && j.candidates[0].groundingMetadata;
  let chunks = "";
  if (gm && gm.groundingChunks) {
    const links = gm.groundingChunks.map(c => (c.web ? (c.web.title || "") + " :: " + (c.web.uri || "") : "")).filter(Boolean);
    chunks = "\n    CHUNKS:\n      " + links.join("\n      ");
  }
  return txt + chunks;
}

(async () => {
  for (const variant of ["loose"]) {
    console.log("\n========== VARIANTE: " + variant + " ==========");
    for (const p of people) {
      try { const out = await ask(p, variant); console.log("\n• " + p.full + " (" + p.comp + ")\n  → " + out); }
      catch (e) { console.log("\n• " + p.full + " → EXC " + e.message); }
    }
  }
})();
