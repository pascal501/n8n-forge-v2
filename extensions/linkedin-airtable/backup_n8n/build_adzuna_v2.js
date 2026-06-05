// Construit la v2 du moteur Adzuna : ajoute Gemini pour enrichir LinkedIn en temps réel.
const fs = require("fs");
const dir = "\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n";
const wf = JSON.parse(fs.readFileSync(dir + "\\cibles.json", "utf8"));

// Ajoute 2 nœuds après l'Airtable Upsert existant
const geminiNode = {
  parameters: {
    jsCode: `// Enrichit les cibles créées/mises à jour avec leur page LinkedIn via Gemini
const items = $input.all();
const http = this.helpers.httpRequest;
const GKEY = $env.GEMINI_API_KEY;
const cache = new Map();
const out = [];

const clean = n => (n || '').replace(/\\s*\\([^)]*\\)\\s*/g, ' ').replace(/—.*$/, '').replace(/\\s+/g, ' ').trim();

for (const it of items) {
  const f = it.json;
  const id = f.id;
  const company = (f.Entreprise || '').toString().trim();
  if (!company || !id) continue;

  const c = clean(company);
  let url = '';

  if (cache.has(c)) {
    url = cache.get(c);
  } else {
    try {
      if (GKEY) {
        const prompt = "Quelle est l'URL exacte de la page LinkedIn officielle de l'entreprise/organisation « " + c +
          " » en France ? Réponds UNIQUEMENT par l'URL au format https://www.linkedin.com/company/... " +
          "Si tu n'es pas certain à 100% que c'est la bonne organisation, réponds exactement: AUCUNE. Aucun autre texte.";
        const r = await http({
          method: 'POST',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(GKEY),
          body: { contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } },
          json: true,
        });
        const parts = (r && r.candidates && r.candidates[0] && r.candidates[0].content && r.candidates[0].content.parts) || [];
        const txt = parts.map(p => p.text || '').join(' ');
        const m = txt.match(/https?:\\/\\/[a-z.]*linkedin\\.com\\/company\\/[^\\s)"']+/i);
        if (m) url = m[0].replace(/[).,]+$/, '').replace(/\\/$/, '');
      }
    } catch (e) { url = ''; }
    cache.set(c, url);
  }

  // Retourne TOUTES les cibles (même sans URL) pour l'update Airtable
  out.push({ json: { id: id, Entreprise: company, 'Page LinkedIn entreprise': url } });
}
return out;
`,
  },
  id: "li000005-eeee-4fff-9000-000000000005",
  name: "Gemini : enrichissement LinkedIn",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1920, -96],
};

const updateNode = {
  parameters: {
    operation: "update",
    base: wf.nodes[3].parameters.base,
    table: wf.nodes[3].parameters.table,
    columns: {
      mappingMode: "autoMapInputData",
      value: {},
      matchingColumns: ["id"],
      schema: [
        { id: "id", displayName: "id", required: false, defaultMatch: true, display: true, type: "string", readOnly: true, removed: false },
        { id: "Page LinkedIn entreprise", displayName: "Page LinkedIn entreprise", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", readOnly: false, removed: false },
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
    options: { typecast: true },
  },
  id: "li000006-ffff-5000-9111-000000000006",
  name: "Airtable : Update LinkedIn",
  type: "n8n-nodes-base.airtable",
  typeVersion: 2.1,
  position: [2224, -96],
  credentials: wf.nodes[3].credentials,
};

// Ajoute les 2 nœuds
wf.nodes.push(geminiNode);
wf.nodes.push(updateNode);

// Met à jour les connexions
wf.connections["Airtable Comptes Cibles upsert"] = {
  main: [[{ node: "Gemini : enrichissement LinkedIn", type: "main", index: 0 }]]
};
wf.connections["Gemini : enrichissement LinkedIn"] = {
  main: [[{ node: "Airtable : Update LinkedIn", type: "main", index: 0 }]]
};

fs.writeFileSync(dir + "\\cibles_v2.json", JSON.stringify(wf, null, 2), "utf8");
console.log("✅ Moteur Adzuna v2 construit (6 nœuds : Adzuna + Gemini + 2x Airtable)");
