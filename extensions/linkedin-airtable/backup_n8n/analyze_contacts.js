const fs = require("fs");
const F = "C:\\Users\\Freelance\\.claude\\projects\\--wsl-localhost-Ubuntu-home-paco-projets-n8n-forge-v2\\36b819f0-b0ba-421f-ac8c-aef605c35b2d\\tool-results\\mcp-0038baef-48af-4be6-9c59-c559a9062a40-list_records_for_table-1780650297241.txt";
const data = JSON.parse(fs.readFileSync(F, "utf8"));
const recs = data.records || [];
const total = recs.length;
const empty = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const FLD = {
  poste: "fld9xohOOI7v0VzSV", nom: "fldKHuhRk5eUyP44q", company: "fldLnSlNemwm7GAeZ",
  email: "fldSySExFSwtRyw5b", loc: "fldbrM3RiB3SucwTC", prenom: "flddPeBJqQ3w6YE20",
  statut: "fldlL6vYJZQcM12a7", pname: "fldu7TATUdInwxKKC", li: "fldvNRj7MBoTWmSLx",
  tel: "fldJysnJRkWWqWAM2", pdf: "fldetVRIxwbSaANiC", summary: "fldxjV5XrvA88din3"
};
const g = (r, k) => (r.cellValuesByFieldId || {})[FLD[k]];

let noLI = 0, noEmail = 0, noTel = 0, noPDF = 0, noPoste = 0, noLoc = 0, noCompany = 0, noSummary = 0;
const stat = {};
const noLIlist = [];
const liButNoPDF = [];
for (const r of recs) {
  const s = g(r, "statut"); const sn = s && s.name ? s.name : "?";
  stat[sn] = (stat[sn] || 0) + 1;
  const li = g(r, "li");
  if (empty(li)) { noLI++; noLIlist.push({ name: g(r,"pname") || ((g(r,"prenom")||"")+" "+(g(r,"nom")||"")).trim(), comp: g(r,"company")||"", poste: (g(r,"poste")||"").slice(0,40) }); }
  else if (empty(g(r,"pdf"))) liButNoPDF.push(g(r,"pname"));
  if (empty(g(r, "email"))) noEmail++;
  if (empty(g(r, "tel"))) noTel++;
  if (empty(g(r, "pdf"))) noPDF++;
  if (empty(g(r, "poste"))) noPoste++;
  if (empty(g(r, "loc"))) noLoc++;
  if (empty(g(r, "company"))) noCompany++;
  if (empty(g(r, "summary"))) noSummary++;
}
const pct = (n) => (100 * n / total).toFixed(0) + "%";
console.log("TOTAL contacts (À appeler + À relancer) :", total);
console.log("Répartition statut :", JSON.stringify(stat));
console.log("\nCHAMPS VIDES (nb / %) :");
console.log("  LinkedIn URL   :", noLI, pct(noLI));
console.log("  Email          :", noEmail, pct(noEmail));
console.log("  Téléphone      :", noTel, pct(noTel));
console.log("  Profile PDF(CV):", noPDF, pct(noPDF));
console.log("  Poste          :", noPoste, pct(noPoste));
console.log("  Location       :", noLoc, pct(noLoc));
console.log("  Company Name   :", noCompany, pct(noCompany));
console.log("  Profile Summary:", noSummary, pct(noSummary));
console.log("\nÉTAT LINKEDIN :");
console.log("  ✅ ont une URL LinkedIn :", total - noLI);
console.log("  ❌ SANS URL LinkedIn    :", noLI, "→ à retrouver");
console.log("  ⚠️ URL mais PAS de CV/PDF:", liButNoPDF.length, "→ à scraper");
console.log("\n--- SANS URL LINKEDIN — échantillon 20 ---");
for (const x of noLIlist.slice(0, 20)) console.log("  •", (x.name||"(sans nom)"), "|", x.comp, "|", x.poste);
