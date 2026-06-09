// =============================================================
// pdf-builder.js — Générateur PDF autonome (sans dépendances)
// Format A4, police Helvetica (Latin-1), support complet du
// français (é è ê à ù ç î ô…), multi-pages automatique.
//
// Usage :
//   const pdf = new PDFBuilder();
//   pdf.addPage();  // obligatoire pour la 1ère page
//   pdf.filledRect(0, pdf.H - 50, pdf.W, 50, [0,119,181]);
//   pdf.text('Bonjour', 40, pdf.curY, 20, [255,255,255], true);
//   pdf.down(8);
//   pdf.wrappedText('Description longue...', 40, pdf.curW, 10, [0,0,0]);
//   const base64 = pdf.toBase64();
// =============================================================

class PDFBuilder {
  constructor() {
    this.W  = 595;   // A4 largeur (points)
    this.H  = 842;   // A4 hauteur (points)
    this.M  = 42;    // Marge gauche/droite
    this.curW = this.W - this.M * 2;  // Largeur utile

    this._streams = [];       // Contenu de chaque page (string PDF)
    this._cmds    = [];       // Commandes de la page en cours
    this._curY    = this.H - this.M;
    this._images  = [];       // { binary, pixW, pixH, pageIdx }
    this._pageImages = {};    // pageIdx → [imageIdx, ...]
  }

  // ─── Navigation ────────────────────────────────────────────

  get curY() { return this._curY; }
  set curY(v) { this._curY = v; }

  /** Descend de dy points */
  down(dy) { this._curY -= dy; }

  /** Démarre une nouvelle page (obligatoire avant tout dessin) */
  addPage() {
    if (this._cmds.length) this._streams.push(this._cmds.join('\n'));
    this._cmds = [];
    this._curY = this.H - this.M;
  }

  /** Vérifie si une nouvelle page est nécessaire et l'ajoute si besoin */
  checkPage(needed = 40) {
    if (this._curY < this.M + needed) { this.addPage(); return true; }
    return false;
  }

  // ─── Dessin ────────────────────────────────────────────────

  /** Rectangle rempli avec couleur [r,g,b] */
  filledRect(x, y, w, h, rgb) {
    const c = rgb.map(v => (v / 255).toFixed(4)).join(' ');
    this._push(`${c} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f 0 0 0 rg`);
  }

  /** Ligne horizontale */
  hline(rgb = [200, 200, 200], strokeW = 0.5) {
    const c = rgb.map(v => (v / 255).toFixed(4)).join(' ');
    const x1 = this.M; const x2 = this.W - this.M;
    this._push(`${c} RG ${strokeW} w ${x1} ${this._curY.toFixed(1)} m ${x2} ${this._curY.toFixed(1)} l S 0 0 0 RG`);
    this.down(3);
  }

  /**
   * Texte sur une seule ligne à la position (x, y) donnée.
   * @param {string}  str   - texte
   * @param {number}  x     - position X
   * @param {number}  y     - position Y (base de la ligne)
   * @param {number}  size  - taille en points
   * @param {number[]}rgb   - couleur [r,g,b]
   * @param {boolean} bold  - gras
   */
  text(str, x, y, size, rgb = [0, 0, 0], bold = false) {
    if (!str) return;
    const font = bold ? 'F2' : 'F1';
    const c    = rgb.map(v => (v / 255).toFixed(4)).join(' ');
    const enc  = this._encode(str);
    this._push(`${c} rg BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td ${enc} Tj ET 0 0 0 rg`);
  }

  /**
   * Texte centré sur la largeur de la page.
   * Approximation : 0.5 × size par caractère.
   */
  textCentered(str, y, size, rgb = [0, 0, 0], bold = false) {
    const approxW = str.length * size * 0.50;
    const x = (this.W - approxW) / 2;
    this.text(str, Math.max(this.M, x), y, size, rgb, bold);
  }

  /**
   * Texte avec retour à la ligne automatique.
   * Descend curY au fur et à mesure.
   * @param {string}  str       - texte (peut contenir \n)
   * @param {number}  x         - position X
   * @param {number}  maxW      - largeur max en points
   * @param {number}  size      - taille
   * @param {number[]}rgb
   * @param {boolean} bold
   * @param {number}  lineH     - interligne (défaut : size × 1.35)
   * @returns {number}           nombre de lignes écrites
   */
  wrappedText(str, x, maxW, size, rgb = [0, 0, 0], bold = false, lineH = null) {
    if (!str) return 0;
    const lh    = lineH !== null ? lineH : size * 1.35;
    const lines = this._wrap(String(str), maxW, size);
    lines.forEach((line) => {
      this.checkPage(lh + 4);
      this.text(line, x, this._curY, size, rgb, bold);
      this.down(lh);
    });
    return lines.length;
  }

  // ─── Image JPEG ─────────────────────────────────────────────

  /**
   * Ajoute une image JPEG dans la page courante.
   * @param {string} dataUrl  - data:image/jpeg;base64,...
   * @param {number} x        - position X (points)
   * @param {number} y        - position Y du bas de l'image (points)
   * @param {number} drawW    - largeur d'affichage (points)
   * @param {number} drawH    - hauteur d'affichage (points)
   */
  addJpegImage(dataUrl, x, y, drawW, drawH) {
    if (!dataUrl) return;
    const base64 = dataUrl.split(',')[1];
    if (!base64) return;
    const binary = atob(base64);

    // Extraire dimensions pixel du header JPEG (SOF0 / SOF2)
    let pixW = drawW, pixH = drawH;
    for (let i = 0; i < binary.length - 10; i++) {
      if (binary.charCodeAt(i) === 0xFF) {
        const m = binary.charCodeAt(i + 1);
        if (m === 0xC0 || m === 0xC2) {
          pixH = (binary.charCodeAt(i + 5) << 8) | binary.charCodeAt(i + 6);
          pixW = (binary.charCodeAt(i + 7) << 8) | binary.charCodeAt(i + 8);
          break;
        }
      }
    }

    const pageIdx = this._streams.length; // index de la page en cours (pas encore finalisée)
    const imgIdx  = this._images.length;
    this._images.push({ binary, pixW, pixH });
    if (!this._pageImages[pageIdx]) this._pageImages[pageIdx] = [];
    this._pageImages[pageIdx].push(imgIdx);

    const imgName = `Im${imgIdx}`;
    this._push(`q ${drawW.toFixed(1)} 0 0 ${drawH.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} cm /${imgName} Do Q`);
  }

  // ─── Internals ─────────────────────────────────────────────

  _push(cmd) { this._cmds.push(cmd); }

  /** Découpe en lignes selon la largeur approximative */
  _wrap(text, maxW, size) {
    const maxC = Math.floor(maxW / (size * 0.50));
    const out  = [];

    text.split('\n').forEach((para) => {
      if (!para.trim()) { out.push(''); return; }
      const words = para.trim().split(/\s+/);
      let line = '';
      words.forEach((w) => {
        const test = line ? line + ' ' + w : w;
        if (test.length <= maxC) {
          line = test;
        } else {
          if (line) out.push(line);
          // Mot plus long que la ligne → forcer la coupure
          if (w.length > maxC) {
            for (let i = 0; i < w.length; i += maxC) out.push(w.slice(i, i + maxC));
            line = '';
          } else {
            line = w;
          }
        }
      });
      if (line) out.push(line);
    });
    return out;
  }

  /**
   * Encode une chaîne JavaScript en littéral PDF avec échappement Latin-1.
   * Les caractères >127 et ≤255 sont encodés en octal (\xxx).
   * Les caractères >255 sont translittérés ou remplacés par '?'.
   */
  _encode(str) {
    const TRANSLIT = {
      '’': "'", '‘': "'", '“': '"', '”': '"',
      '–': '-', '—': '-', '…': '...', '·': '.',
      '•': '-', ' ': ' ', '«': '<<', '»': '>>',
      '€': 'EUR', '°': 'deg',
    };
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const c    = str[i];
      const code = str.charCodeAt(i);
      if (code === 40 || code === 41 || code === 92) {
        result += '\\' + c;         // () et \ doivent être échappés
      } else if (code < 32) {
        // Ignorer les caractères de contrôle
      } else if (code <= 126) {
        result += c;                 // ASCII normal
      } else if (code <= 255) {
        result += '\\' + code.toString(8).padStart(3, '0');  // Latin-1 octal
      } else {
        result += TRANSLIT[c] || '?';
      }
    }
    return `(${result})`;
  }

  // ─── Compilation PDF ───────────────────────────────────────

  /**
   * Construit le PDF complet en mémoire (string Latin-1).
   * Structure : Header → Fonts → Streams de pages → Pages → Pages dict → Catalog → XRef
   */
  build() {
    // Finaliser la dernière page
    if (this._cmds.length) this._streams.push(this._cmds.join('\n'));
    if (!this._streams.length) this._streams.push('');

    const N    = this._streams.length;
    const nImg = this._images.length;
    let pdf = '';
    const off = {};   // id → offset byte

    const writeObj = (id, dictContent, streamContent = null) => {
      off[id] = pdf.length;
      if (streamContent !== null) {
        const len = streamContent.length;
        pdf += `${id} 0 obj\n<< /Length ${len} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
      } else {
        pdf += `${id} 0 obj\n${dictContent}\nendobj\n`;
      }
    };

    // Écriture d'un objet image JPEG (stream binaire avec dict custom)
    const writeImgObj = (id, img) => {
      off[id] = pdf.length;
      const dict = `<< /Type /XObject /Subtype /Image /Width ${img.pixW} /Height ${img.pixH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.binary.length} >>`;
      pdf += `${id} 0 obj\n${dict}\nstream\n${img.binary}\nendstream\nendobj\n`;
    };

    // Identifiants :
    //   1 : Catalog   2 : Pages
    //   3 : Font F1   4 : Font F2
    //   5..4+N       : Streams de contenu (un par page)
    //   5+N..4+2N    : Objets Page
    //   5+2N..4+2N+nImg : Objets Image XObject
    const streamBase = 5;
    const pageBase   = 5 + N;
    const imgBase    = 5 + 2 * N;
    const maxId      = 4 + 2 * N + nImg;

    pdf += '%PDF-1.4\n';
    pdf += `%\xe2\xe3\xcf\xd3\n`;  // Marqueur binaire (4 octets >127)

    // Fontes
    writeObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    writeObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    // Images XObject
    for (let i = 0; i < nImg; i++) writeImgObj(imgBase + i, this._images[i]);

    // Streams de contenu
    for (let i = 0; i < N; i++) writeObj(streamBase + i, null, this._streams[i]);

    // Objets Page (avec référence au stream de contenu + XObjects images)
    const font = '/Font << /F1 3 0 R /F2 4 0 R >>';
    for (let i = 0; i < N; i++) {
      // Construire les références XObject pour cette page
      const pageImgIdxs = this._pageImages[i] || [];
      let xobjStr = '';
      if (pageImgIdxs.length) {
        const refs = pageImgIdxs.map((idx) => `/Im${idx} ${imgBase + idx} 0 R`).join(' ');
        xobjStr = ` /XObject << ${refs} >>`;
      }
      writeObj(
        pageBase + i,
        `<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${this.W} ${this.H}] ` +
        `/Contents ${streamBase + i} 0 R ` +
        `/Resources << ${font}${xobjStr} >> >>`
      );
    }

    // Pages dict
    const kids = Array.from({ length: N }, (_, i) => `${pageBase + i} 0 R`).join(' ');
    writeObj(2, `<< /Type /Pages /Kids [${kids}] /Count ${N} >>`);

    // Catalog
    writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>');

    // ─── Cross-reference table ───
    const xrefPos = pdf.length;
    pdf += 'xref\n';
    pdf += `0 ${maxId + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let id = 1; id <= maxId; id++) {
      if (off[id] !== undefined) {
        pdf += `${String(off[id]).padStart(10, '0')} 00000 n \n`;
      } else {
        pdf += '0000000000 65535 f \n';
      }
    }

    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefPos}\n`;
    pdf += '%%EOF\n';

    return pdf;
  }

  /**
   * Retourne le PDF encodé en base64 (prêt pour Airtable).
   * Chaque caractère de la string PDF est traité comme un byte Latin-1.
   */
  toBase64() {
    const pdfStr = this.build();
    let bin = '';
    for (let i = 0; i < pdfStr.length; i++) {
      bin += String.fromCharCode(pdfStr.charCodeAt(i) & 0xff);
    }
    return btoa(bin);
  }
}

// Exposition globale pour popup.js
if (typeof window !== 'undefined') window.PDFBuilder = PDFBuilder;
