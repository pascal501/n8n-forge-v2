// Construit le workflow "Enrichissement LinkedIn Comptes Cibles" :
// Schedule 04h00 → Airtable search (Comptes Cibles) → Code (Gemini grounding) → Airtable update.
const fs = require("fs");
const dir = "\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\_n8n_backup";
const cibles = JSON.parse(fs.readFileSync(dir + "\\cibles.json", "utf8"));

// Réutilise base / table / credentials du nœud upsert existant (Comptes Cibles)
const upsert = cibles.nodes.find(n => n.name === "Airtable Comptes Cibles upsert");
const baseRL = upsert.parameters.base;
const tableRL = upsert.parameters.table;
const creds = upsert.credentials;

const trigger = {
  parameters: { rule: { interval: [{ field: "cronExpression", expression: "0 4 * * *" }] } },
  id: "li000001-aaaa-4bbb-8ccc-000000000001",
  name: "Chaque nuit 04h00", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [240, 300],
};

const search = {
  parameters: { operation: "search", base: baseRL, table: tableRL, options: {} },
  id: "li000002-bbbb-4ccc-8ddd-000000000002",
  name: "Airtable : Comptes Cibles", type: "n8n-nodes-base.airtable", typeVersion: 2.1, position: [460, 300],
  credentials: creds,
};

const code = {
  parameters: {
    jsCode: `// Pour chaque Compte Cible SANS page LinkedIn : Gemini 2.5 Flash + grounding → URL company
const items = $input.all();
const http = this.helpers.httpRequest;
const GKEY = $env.GEMINI_API_KEY;
const cache = new Map();
const out = [];

const clean = n => (n || '').replace(/\\s*\\([^)]*\\)\\s*/g, ' ').replace(/—.*$/, '').replace(/\\s+/g, ' ').trim();

for (const it of items) {
  const f = it.json;
  const company = (f.Entreprise || '').toString().trim();
  const existing = (f['Page LinkedIn entreprise'] || '').toString().trim();
  if (!company || existing) continue;               // déjà rempli ou pas de nom → on saute
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
    } catch (e) { url = ''; }                        // best-effort : jamais bloquant
    cache.set(c, url);
  }
  if (url) out.push({ json: { id: f.id, 'Page LinkedIn entreprise': url } });
}
return out;
`,
  },
  id: "li000003-cccc-4ddd-8eee-000000000003",
  name: "Gemini : page LinkedIn", type: "n8n-nodes-base.code", typeVersion: 2, position: [680, 300],
};

const update = {
  parameters: {
    operation: "update", base: baseRL, table: tableRL,
    columns: {
      mappingMode: "autoMapInputData", value: {}, matchingColumns: ["id"],
      schema: [
        { id: "id", displayName: "id", required: false, defaultMatch: true, display: true, type: "string", readOnly: true, removed: false },
        { id: "Page LinkedIn entreprise", displayName: "Page LinkedIn entreprise", required: false, defaultMatch: false, canBeUsedToMatch: true, display: true, type: "string", readOnly: false, removed: false },
      ],
      attemptToConvertTypes: false, convertFieldsToString: false,
    },
    options: { typecast: true },
  },
  id: "li000004-dddd-4eee-8fff-000000000004",
  name: "Airtable : Update page LinkedIn", type: "n8n-nodes-base.airtable", typeVersion: 2.1, position: [900, 300],
  credentials: creds,
};

const wf = {
  name: "Shodo - Enrichissement LinkedIn Comptes Cibles (Gemini)",
  nodes: [trigger, search, code, update],
  connections: {
    "Chaque nuit 04h00": { main: [[{ node: "Airtable : Comptes Cibles", type: "main", index: 0 }]] },
    "Airtable : Comptes Cibles": { main: [[{ node: "Gemini : page LinkedIn", type: "main", index: 0 }]] },
    "Gemini : page LinkedIn": { main: [[{ node: "Airtable : Update page LinkedIn", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

fs.writeFileSync(dir + "\\cibles_linkedin_put.json", JSON.stringify(wf, null, 2), "utf8");
console.log("OK — workflow LinkedIn Comptes Cibles construit (4 nœuds).");
