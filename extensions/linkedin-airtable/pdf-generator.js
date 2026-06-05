// Générateur PDF — support complet des caractères français via encodage WinAnsi (octal)
// Stratégie : tous les caractères non-ASCII sont écrits comme \ddd (octal) dans le flux PDF.
// Conséquence : le flux est 100% ASCII → stream.length === byteLength → offsets xref exacts.

function generateProfilePDF(profile) {

  // ── Encodage WinAnsiEncoding ────────────────────────────────────────────────
  // Convertit une chaîne JS en chaîne PDF-safe avec échappements octaux pour accents.
  // Le résultat ne contient que des caractères ASCII (0x20-0x7E + \ddd).
  function ps(input) {
    const s = String(input || '').replace(/[\r\n]+/g, ' ');
    let r = '';
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      // Caractères spéciaux PDF
      if (code === 92) { r += '\\\\'; continue; }   // backslash
      if (code === 40) { r += '\\(';  continue; }   // (
      if (code === 41) { r += '\\)';  continue; }   // )
      // ASCII imprimable
      if (code >= 32 && code <= 126) { r += s[i]; continue; }
      // Latin-1 (0x80-0xFF) → octal direct (WinAnsiEncoding couvre tout le latin-1)
      if (code >= 128 && code <= 255) {
        r += '\\' + code.toString(8).padStart(3, '0');
        continue;
      }
      // Hors Latin-1 : table des chars CP1252 courants
      const cp1252 = {
        0x152: 0x8C, 0x153: 0x9C,   // Œ œ
        0x2013: 0x96, 0x2014: 0x97, // – —
        0x2018: 0x91, 0x2019: 0x92, // ' '
        0x201C: 0x93, 0x201D: 0x94, // " "
        0x2026: 0x85,                // …
        0x20AC: 0x80,                // €
      };
      if (cp1252[code] !== undefined) {
        r += '\\' + cp1252[code].toString(8).padStart(3, '0');
        continue;
      }
      // Fallback : décompose et prend le caractère de base (enlève les diacritiques)
      const base = s[i].normalize('NFD').charCodeAt(0);
      if (base >= 32 && base <= 126) { r += String.fromCharCode(base); continue; }
      if (base >= 128 && base <= 255) {
        r += '\\' + base.toString(8).padStart(3, '0');
        continue;
      }
      // Emoji et autres → espace
      r += ' ';
    }
    return r;
  }

  // Découpe un texte en lignes de maxLen caractères (sur les mots)
  function wrap(text, maxLen) {
    if (!text) return [];
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (test.length > maxLen) {
        if (cur) lines.push(cur);
        cur = w.length > maxLen ? w.substring(0, maxLen) : w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── Flux de contenu de la page ─────────────────────────────────────────────
  const cmds = [];

  // ── En-tête bleu (style LinkedIn) ─────────────────────────────────────────
  // Rectangle bleu LinkedIn en haut de page (y de 762 à 842)
  cmds.push('q 0.039 0.4 0.761 rg 0 762 595 80 re f Q');

  // Texte blanc dans l'en-tête
  cmds.push('q 1 1 1 rg');
  cmds.push(`BT /F1 17 Tf 30 820 Td (${ps(profile.fullName)}) Tj ET`);

  // Poste — peut être long, on prend les 2 premières lignes
  const posLines = wrap(profile.position, 78);
  if (posLines[0]) cmds.push(`BT /F2 9 Tf 30 800 Td (${ps(posLines[0])}) Tj ET`);
  if (posLines[1]) cmds.push(`BT /F2 9 Tf 30 788 Td (${ps(posLines[1])}) Tj ET`);

  // Entreprise + Localisation (dans l'en-tête bleu)
  const compY = posLines[1] ? 774 : 784;
  if (profile.company) cmds.push(`BT /F1 9 Tf 30 ${compY} Td (${ps(profile.company)}) Tj ET`);
  if (profile.location) {
    const locY = compY - 14;
    cmds.push(`BT /F2 8 Tf 30 ${locY} Td (${ps(profile.location)}) Tj ET`);
  }
  cmds.push('Q');

  // ── Corps (texte noir) ─────────────────────────────────────────────────────
  cmds.push('0 0 0 rg');
  let y = 742;

  // Helper : ligne label + valeur
  const row = (label, value, maxV = 80) => {
    if (!value) return;
    cmds.push(`BT /F1 9 Tf 30 ${y} Td (${ps(label)}) Tj ET`);
    cmds.push(`BT /F2 9 Tf 120 ${y} Td (${ps(String(value).substring(0, maxV))}) Tj ET`);
    y -= 16;
  };

  // Coordonnées (comme sur la page LinkedIn "Coordonnées")
  row('Email :', profile.email);
  row('Telephone :', profile.phone);
  row('Site web :', profile.website);
  row('LinkedIn :', profile.linkedinUrl, 100);
  if (profile.connectedDate) {
    row('Connecte le :', profile.connectedDate);
  }

  if (profile.email || profile.phone || profile.website || profile.linkedinUrl || profile.connectedDate) {
    y -= 6;
    cmds.push(`0.8 0.8 0.8 rg 30 ${y} 535 0.5 re f 0 0 0 rg`);
    y -= 14;
  }

  // Poste complet (si > 78 chars, toutes les lignes)
  if (posLines.length > 2 || (posLines[0] && posLines.length >= 1)) {
    cmds.push(`BT /F1 10 Tf 30 ${y} Td (Poste) Tj ET`);
    y -= 14;
    for (const line of posLines) {
      if (y < 40) break;
      cmds.push(`BT /F2 9 Tf 30 ${y} Td (${ps(line)}) Tj ET`);
      y -= 13;
    }
    y -= 8;
    cmds.push(`0.8 0.8 0.8 rg 30 ${y} 535 0.5 re f 0 0 0 rg`);
    y -= 14;
  }

  // Résumé / À propos
  if (profile.summary && profile.summary.trim().length > 10) {
    cmds.push(`BT /F1 10 Tf 30 ${y} Td (A propos) Tj ET`);
    y -= 14;
    for (const line of wrap(profile.summary, 88).slice(0, 35)) {
      if (y < 40) break;
      cmds.push(`BT /F2 9 Tf 30 ${y} Td (${ps(line)}) Tj ET`);
      y -= 13;
    }
  }

  // Pied de page
  const footer = ps('Exporte depuis LinkedIn le ' + new Date().toLocaleDateString('fr-FR'));
  cmds.push(`0.55 0.55 0.55 rg BT /F2 7 Tf 30 20 Td (${footer}) Tj ET`);

  // ── Assemblage du fichier PDF ──────────────────────────────────────────────
  // Tous les cmds sont ASCII → stream.length === byteLength → offsets xref exacts
  const stream = cmds.join('\n');

  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n/Contents 4 0 R\n/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objects) { offsets.push(pdf.length); pdf += o; }

  const xrefPos = pdf.length;
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  for (const off of offsets) pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return pdf;
}
