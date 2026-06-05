const people = [
  { full: "Clément Thubert", comp: "Ouest France" },
  { full: "Claude Le Goff", comp: "Viaccess-Orca" },
  { full: "Laurent Bouillot", comp: "SIRADEL" },
  { full: "Cédric Hardouin", comp: "Viaccess-Orca" },
  { full: "Stéphanie Pouliquen", comp: "Cityzen" },
  { full: "Nathalie Secher", comp: "Cityzen" }
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function extractLinkedin(html) {
  const urls = new Set();
  // DDG html wraps result links; decode uddg= redirects and direct hrefs
  const re = /uddg=([^&"']+)/g; let m;
  while ((m = re.exec(html))) { try { const u = decodeURIComponent(m[1]); if (/linkedin\.com\/in\//i.test(u)) urls.add(u.split("?")[0]); } catch (e) {} }
  const re2 = /https?:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/gi; let m2;
  while ((m2 = re2.exec(html))) urls.add(m2[0]);
  return [...urls];
}

async function ddg(q) {
  const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), { headers: { "User-Agent": UA, "Accept": "text/html" } });
  const status = r.status;
  const html = await r.text();
  return { status, len: html.length, links: extractLinkedin(html) };
}

(async () => {
  for (const p of people) {
    const q = '"' + p.full + '" "' + p.comp + '" site:linkedin.com/in';
    try { const o = await ddg(q); console.log("\n• " + p.full + " (" + p.comp + ")  [http " + o.status + ", " + o.len + "o]"); for (const l of o.links.slice(0, 4)) console.log("    " + l); if (!o.links.length) console.log("    (aucun /in/ trouvé)"); }
    catch (e) { console.log("\n• " + p.full + " → EXC " + e.message); }
    await new Promise(r => setTimeout(r, 1500));
  }
})();
