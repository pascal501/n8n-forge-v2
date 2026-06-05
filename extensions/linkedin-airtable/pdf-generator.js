// Générateur PDF MULTI-PAGES — support complet des accents (WinAnsi octal) et
// pagination automatique. Reçoit le texte visible complet du profil (rawText) et
// le rend sur autant de pages A4 que nécessaire. 100% ASCII → offsets xref exacts.

function generateProfilePDF(profile) {

  // ── Encodage WinAnsiEncoding (accents en octal → flux ASCII) ────────────────
  function ps(input) {
    const s = String(input || "").replace(/[\r\n]+/g, " ");
    let r = "";
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code === 92) { r += "\\\\"; continue; }
      if (code === 40) { r += "\\("; continue; }
      if (code === 41) { r += "\\)"; continue; }
      if (code >= 32 && code <= 126) { r += s[i]; continue; }
      if (code >= 128 && code <= 255) { r += "\\" + code.toString(8).padStart(3, "0"); continue; }
      const cp1252 = { 0x152:0x8C,0x153:0x9C,0x2013:0x96,0x2014:0x97,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2026:0x85,0x20AC:0x80 };
      if (cp1252[code] !== undefined) { r += "\\" + cp1252[code].toString(8).padStart(3, "0"); continue; }
      const base = s[i].normalize("NFD").charCodeAt(0);
      if (base >= 32 && base <= 126) { r += String.fromCharCode(base); continue; }
      if (base >= 128 && base <= 255) { r += "\\" + base.toString(8).padStart(3, "0"); continue; }
      r += " ";
    }
    return r;
  }

  // Découpe un texte en lignes de maxLen caractères (sur les mots)
  function wrap(text, maxLen) {
    if (!text) return [];
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (test.length > maxLen) {
        if (cur) lines.push(cur);
        cur = w.length > maxLen ? w.substring(0, maxLen) : w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── Mise en page paginée ────────────────────────────────────────────────────
  const PAGE_W = 595, PAGE_H = 842, MX = 40, TOP = 805, BOTTOM = 42;
  const pages = [];
  let cur = [];
  let y = TOP;

  function ensure(space) {
    if (y - space < BOTTOM) { pages.push(cur); cur = []; y = TOP; }
  }
  function line(str, font, size, dy) {
    ensure(size + 2);
    cur.push(`BT /${font} ${size} Tf ${MX} ${y} Td (${ps(str)}) Tj ET`);
    y -= dy;
  }
  function para(str, font, size, maxLen, dy) {
    for (const ln of wrap(str, maxLen)) line(ln, font, size, dy);
  }
  function rule() { ensure(12); cur.push(`0.8 0.8 0.8 rg ${MX} ${y} ${PAGE_W - 2 * MX} 0.5 re f 0 0 0 rg`); y -= 12; }
  function gap(n) { y -= n; }

  // EN-TÊTE
  line(profile.fullName || "Profil", "F1", 16, 20);
  const headline = [profile.position, profile.company].filter(Boolean).join("  -  ");
  if (headline) para(headline, "F2", 10, 80, 13);
  if (profile.location) line(profile.location, "F2", 9, 14);
  gap(4); rule();

  // COORDONNÉES
  line("COORDONNEES", "F1", 11, 16);
  const row = (label, val) => {
    if (!val) return;
    ensure(14);
    cur.push(`BT /F1 9 Tf ${MX} ${y} Td (${ps(label)}) Tj ET`);
    cur.push(`BT /F2 9 Tf ${MX + 90} ${y} Td (${ps(String(val).substring(0, 95))}) Tj ET`);
    y -= 14;
  };
  row("Email :", profile.email);
  row("Telephone :", profile.phone);
  row("Site web :", profile.website);
  row("LinkedIn :", profile.linkedinUrl);
  row("Connecte le :", profile.connectedDate);
  gap(4); rule();

  // RÉSUMÉ (Gemini / À propos)
  if (profile.summary && profile.summary.trim().length > 10) {
    line("RESUME", "F1", 11, 16);
    para(profile.summary, "F2", 9, 95, 13);
    gap(4); rule();
  }

  // PROFIL COMPLET (texte visible scrapé de la page)
  if (profile.rawText && profile.rawText.trim().length > 20) {
    line("PROFIL COMPLET (extrait de la page LinkedIn)", "F1", 11, 16);
    for (const rawLine of profile.rawText.split("\n")) {
      const t = rawLine.trim();
      if (!t) { gap(4); continue; }
      para(t, "F2", 8, 110, 11);
    }
  }

  if (cur.length) pages.push(cur);
  if (pages.length === 0) pages.push([`BT /F2 9 Tf ${MX} ${TOP} Td (${ps(profile.fullName || "Profil")}) Tj ET`]);

  // ── Assemblage multi-pages ──────────────────────────────────────────────────
  const objects = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  const kids = [];
  let nextId = 5;
  for (const cmds of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    const stream = cmds.join("\n");
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;
    kids.push(`${pageId} 0 R`);
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  const maxId = nextId - 1;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id <= maxId; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) pdf += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return pdf;
}
