// v2 robuste : timeout par requête + sauvegarde incrémentale + reprise.
const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\_n8n_backup";
const key = fs.readFileSync(base + "\\.gemini_api_key", "utf8").trim();
const comptes = JSON.parse(fs.readFileSync(dir + "\\comptes.json", "utf8"));
const RESULTS = dir + "\\results.json";

// Reprise : recharge les résultats déjà obtenus
let results = [];
try { results = JSON.parse(fs.readFileSync(RESULTS, "utf8")); } catch {}
const done = new Set(results.map(r => r.id));

const cleanName = n => n.replace(/\s*\([^)]*\)\s*/g, " ").replace(/—.*$/, "").replace(/\s+/g, " ").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findLinkedIn(nom) {
  const clean = cleanName(nom);
  const prompt =
    `Quelle est l'URL exacte de la page LinkedIn officielle de l'entreprise/organisation « ${clean} » en France ? ` +
    `Réponds UNIQUEMENT par l'URL au format https://www.linkedin.com/company/... ` +
    `Si tu n'es pas certain à 100% que c'est la bonne organisation, réponds exactement: AUCUNE. Aucun autre texte.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);   // ⏱️ 20s max par requête
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0 },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const json = await resp.json();
      if (!resp.ok) { if (resp.status === 429) { await sleep(3000); continue; } return ""; }
      const txt = (json.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ") || "").trim();
      const m = txt.match(/https?:\/\/[a-z.]*linkedin\.com\/company\/[^\s)"']+/i);
      return m ? m[0].replace(/[).,]+$/, "").replace(/\/$/, "") : "";
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 1) return "";          // timeout/erreur → vide, on continue
      await sleep(1000);
    }
  }
  return "";
}

(async () => {
  for (let i = 0; i < comptes.length; i++) {
    const c = comptes[i];
    if (done.has(c.id)) { console.log(`[${i + 1}/56] ${c.nom} (déjà fait)`); continue; }
    let urlFound = "";
    try { urlFound = await findLinkedIn(c.nom); } catch {}
    results.push({ id: c.id, nom: c.nom, url: urlFound });
    fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2), "utf8");   // 💾 sauvegarde à chaque pas
    console.log(`[${i + 1}/56] ${c.nom}  →  ${urlFound || "(aucune)"}`);
    await sleep(300);
  }
  const found = results.filter(r => r.url).length;
  console.log(`\n=== Terminé : ${found}/${results.length} pages trouvées ===`);
})();
