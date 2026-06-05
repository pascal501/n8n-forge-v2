// Enrichit les 56 Comptes Cibles : trouve la page LinkedIn via Gemini 2.5 Flash + grounding.
// Écrit results.json = [{id, nom, url}] (url vide si AUCUNE). Ne touche PAS Airtable (fait après via MCP).
const fs = require("fs");
const base = "\\\\wsl.localhost\\Ubuntu\\home\\paco";
const dir = base + "\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\_n8n_backup";
const key = fs.readFileSync(base + "\\.gemini_api_key", "utf8").trim();
const comptes = JSON.parse(fs.readFileSync(dir + "\\comptes.json", "utf8"));

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
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0 },
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        if (resp.status === 429) { await sleep(3000); continue; }   // rate limit → retry
        return { url: "", note: "HTTP " + resp.status };
      }
      const txt = (json.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ") || "").trim();
      const m = txt.match(/https?:\/\/[a-z.]*linkedin\.com\/company\/[^\s)"']+/i);
      return { url: m ? m[0].replace(/[).,]+$/, "").replace(/\/$/, "") : "", note: m ? "" : "AUCUNE" };
    } catch (e) {
      if (attempt === 1) return { url: "", note: "ERR " + e.message };
      await sleep(1500);
    }
  }
  return { url: "", note: "échec" };
}

(async () => {
  const results = [];
  let found = 0;
  for (let i = 0; i < comptes.length; i++) {
    const c = comptes[i];
    const r = await findLinkedIn(c.nom);
    if (r.url) found++;
    results.push({ id: c.id, nom: c.nom, url: r.url });
    console.log(`[${i + 1}/${comptes.length}] ${c.nom}  →  ${r.url || "(aucune)"}`);
    await sleep(400);   // throttle léger
  }
  fs.writeFileSync(dir + "\\results.json", JSON.stringify(results, null, 2), "utf8");
  console.log(`\n=== Terminé : ${found}/${comptes.length} pages LinkedIn trouvées ===`);
})();
