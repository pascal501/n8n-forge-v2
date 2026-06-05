const fs = require("fs");
const F = "C:\\Users\\Freelance\\.claude\\projects\\--wsl-localhost-Ubuntu-home-paco-projets-n8n-forge-v2\\36b819f0-b0ba-421f-ac8c-aef605c35b2d\\tool-results\\mcp-0038baef-48af-4be6-9c59-c559a9062a40-list_records_for_table-1780650297241.txt";
const data = JSON.parse(fs.readFileSync(F, "utf8"));
const FLD = { poste: "fld9xohOOI7v0VzSV", nom: "fldKHuhRk5eUyP44q", company: "fldLnSlNemwm7GAeZ", loc: "fldbrM3RiB3SucwTC", prenom: "flddPeBJqQ3w6YE20", statut: "fldlL6vYJZQcM12a7", pname: "fldu7TATUdInwxKKC", li: "fldvNRj7MBoTWmSLx" };
const g = (r, k) => (r.cellValuesByFieldId || {})[FLD[k]];
const empty = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
const out = [];
for (const r of data.records) {
  if (!empty(g(r, "li"))) continue; // a déjà une URL live
  const prenom = (g(r, "prenom") || "").toString().trim();
  const nom = (g(r, "nom") || "").toString().trim();
  let full = (prenom + " " + nom).trim();
  if (!full) full = (g(r, "pname") || "").toString().trim();
  out.push({ id: r.id, full, comp: (g(r, "company") || "").toString().trim(), poste: (g(r, "poste") || "").toString().trim().slice(0, 60), loc: (g(r, "loc") || "").toString().trim() });
}
fs.writeFileSync("\\\\wsl.localhost\\Ubuntu\\home\\paco\\projets\\n8n-forge-v2\\extensions\\linkedin-airtable\\backup_n8n\\todo63.json", JSON.stringify(out, null, 1));
console.log("Total à traiter :", out.length);
out.forEach((x, i) => console.log((i + 1) + ". " + x.id + " | " + (x.full || "(?)") + " | " + x.comp + " | " + x.poste));
