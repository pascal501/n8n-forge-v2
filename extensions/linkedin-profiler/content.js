// =============================================================
// content.js — LinkedIn Profile & Company Scraper
//
// ─── STRATÉGIE DE RÉSILIENCE AUX CHANGEMENTS DE CLASSES ───────
//
// LinkedIn refactorise régulièrement ses noms de classes CSS.
// Ce code évite de s'y fier autant que possible et préfère :
//
//   1. PATTERNS D'URL CDN
//      Les images de profil et logos sont servis par media.licdn.com
//      ou *.licdn.com — ces domaines ne changent pas.
//
//   2. ATTRIBUTS SÉMANTIQUES (href, aria-label, role, type)
//      Plus stables que les classes car liés à l'accessibilité
//      et au routage interne de LinkedIn.
//
//   3. SCORING D'IMAGES
//      Plutôt qu'un sélecteur précis, on note toutes les images
//      de la page et on choisit la meilleure (CDN + taille + position).
//
//   4. CORRESPONDANCE TEXTE
//      Pour les boutons et liens, on cherche d'abord par texte
//      visible ("Coordonnées", "Contact info") — invariant de langue,
//      mais géré via une liste de variantes.
//
//   5. SÉLECTEURS CSS EN DERNIER RECOURS (liste courte)
//      Quelques sélecteurs de secours pour les cas où les
//      méthodes ci-dessus échouent, ordonnés du plus stable
//      (balise sémantique) au plus fragile (nom de classe).
//
//   6. FALLBACK LLM
//      Si le DOM ne donne rien, le texte brut extractPageText()
//      est toujours envoyé au LLM — il récupère la plupart
//      des informations même sans extraction DOM préalable.
//
// Messages écoutés :
//   { type: 'PING' }            → { pong: true, url, pageType }
//   { type: 'SCRAPE_PROFILE' }  → { success, data }
//   { type: 'SCRAPE_COMPANY' }  → { success, data }
// =============================================================

(function () {
  'use strict';

  // =============================================================
  // ─── UTILITAIRES GÉNÉRIQUES ───────────────────────────────────
  // =============================================================

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Attend qu'un sélecteur CSS apparaisse (MutationObserver) */
  function waitForElement(selectors, timeout = 5000) {
    const sel = Array.isArray(selectors) ? selectors.join(', ') : selectors;
    return new Promise((resolve, reject) => {
      const el = document.querySelector(sel);
      if (el) { resolve(el); return; }
      const obs = new MutationObserver(() => {
        const found = document.querySelector(sel);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: ${sel}`)); }, timeout);
    });
  }

  /**
   * Cherche un élément par son texte visible (insensible à la casse).
   * Plus stable que les classes CSS car LinkedIn ne peut pas changer
   * le texte de ses propres boutons sans casser l'UX de ses utilisateurs.
   *
   * @param {string[]} tags    - Balises HTML à inspecter (ex: ['a','button'])
   * @param {string[]} texts   - Variantes du texte cherché (fr + en)
   * @param {string}   context - Sélecteur de scope (optionnel)
   */
  function findByText(tags, texts, context = '') {
    const scope = context ? document.querySelector(context) : document;
    if (!scope) return null;
    const pattern = new RegExp(texts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    for (const tag of tags) {
      for (const el of scope.querySelectorAll(tag)) {
        if (pattern.test(el.innerText?.trim() || el.textContent?.trim())) return el;
      }
    }
    return null;
  }

  /**
   * Essaie une liste de sélecteurs CSS en ordre et retourne le premier texte non vide.
   * Les sélecteurs les plus stables (balises sémantiques, aria) doivent être en premier.
   */
  function firstText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t  = el?.innerText?.trim();
      if (t) return t;
    }
    return '';
  }

  // =============================================================
  // ─── SCORING D'IMAGES ─────────────────────────────────────────
  //
  // Stratégie principale pour identifier la photo de profil et le
  // logo d'entreprise sans dépendre des classes CSS.
  //
  // Score calculé pour chaque <img> :
  //   +5  URL contient le domaine CDN de LinkedIn (media.licdn.com)
  //   +3  URL contient 'profile-displayphoto' ou 'company-logo'
  //   +2  largeur naturelle ≥ 80px (pas une icône)
  //   +2  rapport largeur/hauteur proche de 1 (image carrée)
  //   +1  image dans le tiers supérieur de la page
  //   -99 URL contient 'ghost' ou 'placeholder' (exclure)
  //
  // Retourne null si aucune image valide (score > 0) n't est trouvée.
  // =============================================================

  function scoredImages(hintKeyword = '', root = document) {
    const pageH  = document.body.scrollHeight || window.innerHeight;
    const scored = [];

    // root = document → toutes les images ; sinon limiter au scope (ex: <main>)
    // pour exclure l'avatar de la barre de navigation (utilisateur connecté).
    const imgs = root === document ? document.images : root.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.src || img.currentSrc || '';
      if (!src.startsWith('http')) continue;

      // Exclure les placeholders fantômes
      if (/ghost|placeholder|blank\.gif|pixel\.gif|spacer/i.test(src)) continue;

      let score = 0;

      // CDN LinkedIn
      if (/licdn\.com/i.test(src))                             score += 5;
      if (/profile-displayphoto|shrink_/i.test(src))           score += 3;
      if (/company-logo|org-logo|dms\/image/i.test(src))       score += 3;
      if (hintKeyword && src.includes(hintKeyword))             score += 2;

      // Taille : préférer les images non-icônes
      const w = img.naturalWidth  || img.width  || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w >= 80 && h >= 80)   score += 2;
      if (w >= 150 && h >= 150) score += 1;

      // Rapport carré (profils et logos sont toujours carrés)
      if (w > 0 && h > 0) {
        const ratio = w / h;
        if (ratio > 0.8 && ratio < 1.25) score += 2;
      }

      // Position dans la page — préférer le haut (header/carte profil)
      const rect = img.getBoundingClientRect();
      const top  = rect.top + window.scrollY;
      if (top < pageH * 0.3) score += 1;

      if (score > 0) scored.push({ img, score, src });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  // =============================================================
  // ─── SCROLL PROGRESSIF ────────────────────────────────────────
  // =============================================================

  async function scrollPage() {
    const total = document.body.scrollHeight;
    for (let y = 0; y < total; y += 500) {
      window.scrollTo(0, y);
      await sleep(180);
    }
    window.scrollTo(0, 0);
    await sleep(400);
  }

  // =============================================================
  // ─── EXPANSION DES SECTIONS "VOIR PLUS" ───────────────────────
  //
  // On cherche d'abord par attributs stables (aria, role, data),
  // puis par texte visible, et enfin par quelques classes connues.
  // =============================================================

  async function expandSections() {
    // Phase 1 : cliquer TOUS les boutons "voir plus" via attributs stables
    const stableAttrs = [
      'button[aria-label*="voir plus" i]',
      'button[aria-label*="show more" i]',
      'button[aria-label*="see more" i]',
      'button[aria-expanded="false"]',
    ];
    for (const sel of stableAttrs) {
      document.querySelectorAll(sel).forEach((btn) => { try { btn.click(); } catch (_) {} });
    }
    await sleep(400);

    // Phase 2 : chercher TOUS les boutons/liens par texte visible (pas seulement le premier)
    const textPatterns = ['voir plus', 'show more', 'see more', 'afficher plus', '…voir plus', '...voir plus'];
    const textPattern = new RegExp(textPatterns.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    for (const tag of ['button', 'span', 'a']) {
      for (const el of document.querySelectorAll(tag)) {
        const t = (el.innerText || el.textContent || '').trim();
        if (textPattern.test(t)) { try { el.click(); } catch (_) {} }
      }
    }
    await sleep(400);

    // Phase 3 : classes de secours (peuvent être obsolètes)
    const fallbackSels = [
      'button.inline-show-more-text__button',
      'span.lt-line-clamp__more',
      'button.pv-profile-section__see-more-inline',
      'button[class*="show-more"]',
      'a[class*="show-more"]',
    ];
    for (const sel of fallbackSels) {
      document.querySelectorAll(sel).forEach((btn) => { try { btn.click(); } catch (_) {} });
    }
    await sleep(400);

    // Phase 4 : deuxième passage — certains "voir plus" n'apparaissent
    // qu'après expansion des sections parentes
    for (const sel of stableAttrs) {
      document.querySelectorAll(sel).forEach((btn) => { try { btn.click(); } catch (_) {} });
    }
    await sleep(300);

    // Phase 5 : boutons "… plus" dans les sections profil (Expérience, Infos, etc.)
    // ATTENTION : ne PAS cliquer ceux de la section Activité (posts) — ils naviguent !
    const plusRx = /^(…|\.{3})\s*(plus|more)$/i;
    const skipSections = /activit|activity|posts/i;
    for (const btn of document.querySelectorAll('button')) {
      const t = (btn.innerText || '').trim();
      if (!plusRx.test(t)) continue;
      const section = btn.closest('section');
      const sTitle = section ? (section.querySelector('h2, h3')?.innerText || '').trim() : '';
      if (sTitle && !skipSections.test(sTitle)) { try { btn.click(); } catch (_) {} }
    }
    await sleep(400);
  }

  // =============================================================
  // ─── EXTRACTION DU TEXTE BRUT ─────────────────────────────────
  // =============================================================

  function extractPageText() {
    const clean = (txt) => (txt || '')
      .replace(/\t/g, ' ')
      .replace(/^.*\d+\s+compétences?\s+de\s+plus.*$/gm, '')
      .replace(/^.*\d+\s+more\s+skills?.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .substring(0, 24000);

    // Méthode 1 : clone (idéal — on peut retirer les sections inutiles)
    try {
      const clone  = document.body.cloneNode(true);
      const remove = [
        'header', 'nav', '.global-nav', '.scaffold-layout__aside',
        'footer', '[class*="ad-banner"]', '.artdeco-modal', 'script', 'style',
      ];
      remove.forEach((s) => clone.querySelectorAll(s).forEach((el) => el.remove()));

      for (const h of clone.querySelectorAll('h2, h3')) {
        const t = (h.innerText || h.textContent || '').trim().toLowerCase();
        if (t === 'activité' || t === 'activity') {
          const sec = h.closest('section');
          if (sec) sec.remove();
        }
      }

      const text = clean(clone.innerText || clone.textContent);
      if (text.length > 50) return text;
    } catch (_) {}

    // Méthode 2 : fallback sur <main> du DOM live (innerText fiable car attaché)
    const main = document.querySelector('main');
    if (main) {
      const text = clean(main.innerText);
      if (text.length > 50) return text;
    }

    // Méthode 3 : dernier recours — body.innerText directement
    return clean(document.body.innerText);
  }

  function getCleanUrl() {
    return window.location.href.split('?')[0].split('#')[0];
  }

  // =============================================================
  // ─── DÉTECTION DU TYPE DE PAGE ────────────────────────────────
  // =============================================================

  function getPageType() {
    const url = window.location.href;
    if (/\/in\/[^/]+/i.test(url))      return 'profile';
    if (/\/company\/[^/]+/i.test(url)) return 'company';
    if (/\/feed\//i.test(url))         return 'feed';
    if (/\/posts\//i.test(url))        return 'post';
    if (url.includes('linkedin.com/feed')) return 'feed';
    return null;
  }

  // =============================================================
  // ── PROFIL PERSONNEL (/in/*) ──────────────────────────────────
  // =============================================================

  // ─── Photo de profil ──────────────────────────────────────────
  //
  // Stratégie par ordre de fiabilité :
  //   1. Scoring d'images — préférer les photos CDN licdn.com carrées
  //      avec le keyword 'profile-displayphoto' dans l'URL
  //   2. Fallback : attributs aria ou alt contenant "photo"
  //   3. Fallback : sélecteurs CSS connus (peuvent être obsolètes)

  function getPhotoUrl() {
    // IMPORTANT : se limiter à <main> pour ne JAMAIS attraper l'avatar de la
    // barre de navigation (= photo de l'utilisateur connecté), qui est aussi
    // une image 'profile-displayphoto' carrée et bien notée.
    const main = document.querySelector('main') || document;

    // Méthode 0 (prioritaire) : la zone "Photo de profil" du top-card.
    // LinkedIn marque cet élément (div ou button) avec aria-label contenant
    // "Photo de profil" / "profile photo". Si l'élément existe mais ne contient
    // PAS d'<img> → l'avatar est un SVG par défaut (pas de photo) → return null
    // immédiatement, sinon le scoring ramasserait les miniatures 100×100
    // d'AUTRES contacts plus bas dans la page.
    const photoZone = main.querySelector(
      '[aria-label*="Photo de profil" i], [aria-label*="profile photo" i]'
    );
    if (photoZone) {
      const zoneImg = photoZone.querySelector('img');
      if (zoneImg?.src?.includes('licdn.com') && !/ghost|placeholder/i.test(zoneImg.src)) {
        return zoneImg.src;
      }
      // La zone existe mais pas d'img réelle → avatar par défaut, pas de photo.
      return null;
    }

    // Méthode 1 : scoring CDN — seulement si le bouton photo n'existe pas
    // (ancien DOM). Filtrer les miniatures ≤100px (avatars d'autres contacts).
    const candidates = scoredImages('profile-displayphoto', main);
    const best = candidates.find(c => {
      const w = c.img.naturalWidth || c.img.width || 0;
      return c.score >= 5 && w > 100;
    });
    if (best) return best.src;

    // Méthode 2 : attributs sémantiques (dans <main>)
    const ariaImg = main.querySelector(
      'img[aria-label*="photo" i], img[alt*="photo" i], img[alt*="profil" i]'
    );
    if (ariaImg?.src?.includes('licdn.com') && !/ghost|placeholder/i.test(ariaImg.src)) {
      return ariaImg.src;
    }

    // Méthode 3 : sélecteurs CSS de secours (dans <main>)
    const cssSels = [
      '.pv-top-card-profile-picture__image--show',
      '.pv-top-card-profile-picture__image',
      'button[aria-label*="photo" i] img',
      '.presence-entity__image',
      'img.pv-top-card__photo',
    ];
    for (const sel of cssSels) {
      const img = main.querySelector(sel);
      if (img?.src?.startsWith('http') && !img.src.includes('ghost')) return img.src;
    }

    return null;
  }

  // ─── Nom du profil ────────────────────────────────────────────

  function getName() {
    // Le nom du profil vit dans la carte d'en-tête, 1er heading sous <main>.
    // LinkedIn a migré le top-card de <h1> vers <h2> (UI 2026) → on accepte
    // les deux. Le 1er heading de <main> est le nom ; les titres de sections
    // ("Expérience", "Formation"…) viennent après dans l'ordre du DOM.
    // On reste scopé à <main> : un heading global (nav/feed) renverrait
    // l'utilisateur connecté. Anti-corruption garanti en amont par le slug
    // guard (background.js) qui rejette toute redirection.
    const main = document.querySelector('main');
    if (main) {
      const t = main.querySelector('h1, h2')?.innerText?.trim();
      if (t && t.length <= 80 && !t.includes('\n')) return t;
    }
    // Filet de sécurité : titre d'onglet "Nom | LinkedIn" (ou "(3) Nom | …").
    // Reflète le profil réellement chargé ; vaut "LinkedIn" seul si non chargé.
    const m = /^(?:\(\d+\)\s*)?(.+?)\s*[|\-–]\s*LinkedIn\s*$/.exec(document.title || '');
    if (m && m[1] && m[1].trim().toLowerCase() !== 'linkedin') return m[1].trim();
    return '';
  }

  // ─── Coordonnées (popup LinkedIn) ─────────────────────────────
  //
  // La détection du lien "Coordonnées" repose sur :
  //   1. href contenant "contact-info" (routing LinkedIn stable)
  //   2. Texte visible "Coordonnées" / "Contact info" (invariant UX)
  // Le parsing du modal utilise les types de liens (mailto:, tel:, http)
  // plutôt que des classes CSS — ces attributs href sont invariants.

  async function getContactInfo() {
    const result = { email: null, phone: null, website: null, twitter: null, connectedDate: null };

    // Trouver le lien "Coordonnées"
    let link =
      document.querySelector('a[href*="overlay/contact-info"]') ||
      document.querySelector('a[href*="contact-info"]')         ||
      findByText(['a', 'button'], ['coordonnées', 'contact info', 'contact information']);

    if (!link) return result;

    link.click();

    try {
      // Attendre le modal — cherche d'abord le dialog natif ARIA
      await waitForElement([
        '[role="dialog"]',
        '.artdeco-modal',
        '[data-view-name*="contact"]',
      ], 5000);
      await sleep(800);

      // Le scope du modal : chercher par role dialog (stable) puis par classe
      const modal =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('.artdeco-modal__content') ||
        document.querySelector('.artdeco-modal');

      if (modal) {
        // Email — attribut href mailto: (invariant)
        const emailLink = modal.querySelector('a[href^="mailto:"]');
        if (emailLink) result.email = emailLink.href.replace('mailto:', '').trim();

        // Site web — lien http non LinkedIn, non Twitter
        for (const a of modal.querySelectorAll('a[href^="http"]')) {
          if (!/linkedin\.com/i.test(a.href) && !/twitter\.com|x\.com/i.test(a.href)) {
            result.website = a.href;
            break;
          }
        }

        // Twitter / X — attribut href (invariant)
        const tw = modal.querySelector('a[href*="twitter.com"], a[href*="x.com"]');
        if (tw) result.twitter = tw.href;

        // Téléphone — pattern regex sur le texte du modal
        // (LinkedIn n'expose pas les numéros via un href tel:)
        const phoneMatch = modal.innerText.match(/(\+?\d[\d\s.\-()]{7,18}\d)/);
        if (phoneMatch && phoneMatch[1].replace(/\D/g, '').length >= 8) {
          result.phone = phoneMatch[1].trim();
        }

        // Date de connexion — texte "Connecté(e) le DD mois YYYY" dans le modal
        const modalText = modal.innerText || '';
        const MOIS = { janvier:'01', février:'02', 'février':'02', mars:'03', avril:'04', mai:'05', juin:'06',
          juillet:'07', août:'08', 'août':'08', septembre:'09', octobre:'10', novembre:'11', décembre:'12', 'décembre':'12' };
        const dateMatch = modalText.match(/connect[ée]+e?\s+le\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const monthStr = dateMatch[2].toLowerCase();
          const month = MOIS[monthStr] || '01';
          const year = dateMatch[3];
          result.connectedDate = `${year}-${month}-${day}`;
        }
      }

      // Fermer le modal via le bouton dismiss (aria-label stable, ou classe de secours)
      const closeBtn =
        document.querySelector('button[aria-label="Fermer"]')    ||
        document.querySelector('button[aria-label="Close"]')     ||
        document.querySelector('button[aria-label="Dismiss"]')   ||
        document.querySelector('[role="dialog"] button:last-child') ||
        document.querySelector('.artdeco-modal__dismiss');
      if (closeBtn) closeBtn.click();
      await sleep(400);

    } catch (err) {
      console.warn('[LinkedIn Profiler] Modal coordonnées :', err.message);
      const closeBtn =
        document.querySelector('button[aria-label="Fermer"]') ||
        document.querySelector('button[aria-label="Close"]');
      if (closeBtn) closeBtn.click();
    }

    return result;
  }

  // ─── URL de la page entreprise (depuis un profil) ─────────────
  //
  // On cible le logo de la dernière expérience (1er lien /company/
  // dans la section Expérience) pour obtenir l'entreprise actuelle.
  // Fallback : n'importe quel lien /company/ dans le main.

  function getCompanyProfileUrl() {
    // Stratégie : trouver le lien /company/ de la DERNIÈRE EXPÉRIENCE
    // (le logo de l'entreprise la plus récente dans la section Expérience)
    const main = document.querySelector('main') || document.body;

    // Méthode 1 : trouver la section Expérience par son titre
    let expSection = null;
    for (const h of main.querySelectorAll('h2, h3, span, div')) {
      const t = (h.innerText || '').trim().toLowerCase();
      if (t === 'expérience' || t === 'experience' || t === 'expériences') {
        expSection = h.closest('section');
        if (expSection) break;
      }
    }

    // Dans la section Expérience, le 1er lien /company/ = entreprise la plus récente
    if (expSection) {
      for (const a of expSection.querySelectorAll('a[href*="/company/"]')) {
        const m = a.href.match(/(https?:\/\/[^/]*linkedin\.com\/company\/[a-z0-9_-]+)/i);
        if (m) return m[1] + '/';
      }
    }

    // Fallback : n'importe quel lien /company/ dans main
    for (const a of main.querySelectorAll('a[href*="/company/"]')) {
      const m = a.href.match(/(https?:\/\/[^/]*linkedin\.com\/company\/[a-z0-9_-]+)/i);
      if (m) return m[1] + '/';
    }

    return null;
  }

  // ─── Contacts en commun ───────────────────────────────────────
  //
  // LinkedIn affiche "NomPrenom et 69 autres relations en commun"
  // comme un lien <a> cliquable. On retourne l'URL complète du lien
  // pour permettre à l'utilisateur de consulter la liste.

  function getMutualConnections() {
    const scope = document.querySelector('main') || document.body;
    const mutualTextRx = /en\s+commun|mutual\s+connections?|shared\s+connections?/i;

    // Méthode 1 : liens href connectionOf filtrés par texte "en commun"
    for (const a of scope.querySelectorAll('a[href*="connectionOf"], a[href*="shared-connections"], a[href*="mutual"]')) {
      const t = (a.innerText || a.textContent || '').trim();
      if (t && mutualTextRx.test(t)) return a.href;
    }

    // Méthode 2 : n'importe quel lien dont le texte mentionne "en commun"
    for (const a of scope.querySelectorAll('a')) {
      const t = (a.innerText || a.textContent || '').trim();
      if (t.length > 0 && t.length < 300 && mutualTextRx.test(t) && a.href) return a.href;
    }

    return null;
  }

  // ─── Scraping des expériences directement depuis le DOM ────────
  //
  // Le LLM a tendance à reformuler les descriptions. On scrape
  // directement le DOM pour obtenir le texte exact de LinkedIn.

  function scrapeExperiences() {
    const main = document.querySelector('main') || document.body;
    let expSection = null;
    for (const h of main.querySelectorAll('h2, h3, span, div')) {
      const t = (h.innerText || '').trim().toLowerCase();
      if (t === 'expérience' || t === 'experience' || t === 'expériences') {
        expSection = h.closest('section');
        if (expSection) break;
      }
    }
    if (!expSection) return [];

    const dateRx = /(?:janv|févr?|mars|avr|mai|juin|juil|août|sept?|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|nov|dec)\.?\s+\d{4}\s*[-–]\s*(?:aujourd|present|current|\w+\.?\s+\d{4})/i;
    const skillsRx = /\d+\s+compétences?\s+de\s+plus|\d+\s+more\s+skills?/i;

    function parseExpText(text) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      let periodeIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (dateRx.test(lines[i])) { periodeIdx = i; break; }
      }
      if (periodeIdx < 0) return null;
      const poste = lines[0] || '';
      const periode = lines[periodeIdx] || '';
      // Description = après la période + la ligne de localisation éventuelle
      let descStart = periodeIdx + 1;
      if (descStart < lines.length && /,/.test(lines[descStart]) && lines[descStart].length < 100) descStart++;
      const descLines = [];
      for (let i = descStart; i < lines.length; i++) {
        if (skillsRx.test(lines[i])) break;
        descLines.push(lines[i]);
      }
      return { poste, periode, description: descLines.join('\n') || '' };
    }

    // Le conteneur des expériences : section > div > div:nth-child(2) > div:nth-child(2)
    const container = expSection.querySelector(':scope > div > div:nth-child(2) > div:nth-child(2)');
    if (!container) return [];

    const experiences = [];
    for (const item of container.children) {
      if (item.tagName !== 'DIV') continue;
      const lis = item.querySelectorAll(':scope li');
      if (lis.length > 0) {
        // Entreprise groupée (plusieurs rôles) — nom de l'entreprise = 1ère ligne
        const companyName = item.innerText?.trim().split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
        for (const li of lis) {
          const parsed = parseExpText(li.innerText?.trim() || '');
          if (parsed) { parsed.entreprise = companyName; experiences.push(parsed); }
        }
      } else {
        // Expérience simple — entreprise sur la 2ème ligne
        const text = item.innerText?.trim() || '';
        const parsed = parseExpText(text);
        if (parsed) {
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          parsed.entreprise = (lines[1] || '').replace(/\s*·\s*(CDI|CDD|Freelance|Stage|Alternance|Intérim|Indépendant|Temps\s+\w+).*$/i, '').trim();
          experiences.push(parsed);
        }
      }
    }
    return experiences;
  }

  // ─── Scraping profil principal ────────────────────────────────

  async function scrapeProfile() {
    try {
      // Attendre que la carte de profil (nom) soit rendue. Les onglets en
      // arrière-plan sont throttlés par Chrome → le rendu peut tarder.
      // Mais si on n'est PAS sur un profil /in/ (redirection feed/login),
      // ne pas attendre inutilement : échouer vite.
      const onProfile = /\/in\/[^/]+/i.test(window.location.href);
      if (onProfile) {
        try { await waitForElement(['main h1', 'main h2'], 10000); } catch (_) {}
      }

      const linkedinUrl = getCleanUrl();
      const name        = getName();

      // Si pas de nom, la page n'est peut-être pas chargée (batch en arrière-
      // plan) ou le DOM a changé. Dans les deux cas, on récupère quand même
      // le rawText pour que le LLM ait de la matière — mais on saute le
      // scroll et la modal coordonnées (5 s perdues) pour que le batch
      // réessaie vite. Le slug guard (background.js) reste la vraie
      // protection anti-corruption.
      const skipHeavy = !name;

      if (!skipHeavy) {
        await scrollPage();
        await expandSections();
      }

      const photoUrl          = skipHeavy ? null : getPhotoUrl();
      const contactInfo       = skipHeavy ? {} : await getContactInfo();
      const companyProfileUrl = skipHeavy ? null : getCompanyProfileUrl();
      const mutualConnections = skipHeavy ? null : getMutualConnections();
      const experiences       = skipHeavy ? [] : scrapeExperiences();

      window.scrollTo(0, 0);
      await sleep(200);

      const rawText = extractPageText();

      return { success: true, data: { linkedinUrl, photoUrl, name, contactInfo, rawText, companyProfileUrl, mutualConnections, experiences } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // =============================================================
  // ── PAGE ENTREPRISE (/company/*) ──────────────────────────────
  // =============================================================

  // ─── Logo de l'entreprise ─────────────────────────────────────
  //
  // Stratégie identique à la photo profil mais avec le keyword
  // 'company-logo' et un score CDN plus large.

  function getCompanyLogoUrl() {
    // Méthode 1 : scoring CDN avec keyword logo
    const candidates = scoredImages('company-logo');
    const best = candidates[0];
    if (best && best.score >= 5) return best.src;

    // Méthode 2 : scoring CDN générique (sans keyword) — prendre la meilleure image carrée
    const generic = scoredImages('')[0];
    if (generic && generic.score >= 7) return generic.src;

    // Méthode 3 : img avec alt contenant le nom de l'entreprise
    const altImg = document.querySelector('img[alt]:not([alt=""])');
    if (altImg?.src?.includes('licdn.com')) return altImg.src;

    // Méthode 4 : sélecteurs CSS de secours
    const cssSels = [
      '.org-top-card-primary-actions__image img',
      '.org-top-card__logo img',
      '.org-top-card-summary__logo img',
      'img.artdeco-entity-image',
    ];
    for (const sel of cssSels) {
      const img = document.querySelector(sel);
      if (img?.src?.startsWith('http') && !img.src.includes('ghost')) return img.src;
    }

    return null;
  }

  // ─── Nom de l'entreprise ──────────────────────────────────────

  function getCompanyName() {
    return firstText([
      'main h1',
      'h1[class*="title" i]',
      'h1[class*="name" i]',
      'h1[class*="org" i]',
      'h1',
    ]);
  }

  // ─── Ouverture de l'onglet "À propos" ────────────────────────
  //
  // Cherche par texte ("À propos", "About") — beaucoup plus stable
  // que de cibler un attribut data-* ou une classe qui change.

  async function openAboutTab() {
    const aboutEl = findByText(
      ['a', 'button', 'li'],
      ['à propos', 'about', 'a propos']
    );
    if (!aboutEl) return false;
    try {
      aboutEl.click();
      await sleep(1500);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Scraping page entreprise ─────────────────────────────────

  async function scrapeCompanyPage() {
    try {
      await scrollPage();
      await expandSections();

      const openedAbout = await openAboutTab();
      if (openedAbout) {
        await scrollPage();
        await expandSections();
      }

      const linkedinUrl = getCleanUrl();
      const logoUrl     = getCompanyLogoUrl();
      const companyName = getCompanyName();
      const rawText     = extractPageText();

      return { success: true, data: { linkedinUrl, logoUrl, companyName, rawText } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // =============================================================
  // ─── MODULE VEILLE FIL LINKEDIN ──────────────────────────────
  //
  // Détecte les posts de recrutement sur le fil LinkedIn de l'utilisateur.
  // Deux modes complémentaires :
  //
  //   Option A — Automatique : un bouton 💼 est injecté sur chaque post
  //     contenant des mots-clés de recrutement. L'utilisateur clique
  //     pour capturer sans ouvrir le popup.
  //
  //   Option C — Manuel : depuis le popup sur une page feed/post,
  //     l'utilisateur voit le nombre de posts détectés et peut tout
  //     capturer en un clic.
  //
  // Filtre géographique : Bretagne + Pays de la Loire
  //   Détecte si la localisation de l'auteur (affichée sous son nom)
  //   correspond à l'une des deux régions.
  //   Si la localisation n'est pas visible → on laisse passer
  //   (l'utilisateur décide via le bouton).
  //
  // Résilience DOM : même logique que le reste du fichier.
  //   Les sélecteurs CSS sont en dernier recours. On préfère :
  //   - data-urn (identifiant stable du post)
  //   - structure sémantique (article, time, a[href*="/posts/"])
  // =============================================================

  // ── Géographie : Bretagne (22, 29, 35, 56) + Pays de la Loire (44, 49, 53, 72, 85) ──
  const REGION_KEYWORDS = [
    // Bretagne — villes principales
    'rennes', 'brest', 'quimper', 'lorient', 'vannes', 'saint-brieuc',
    'saint-malo', 'fougères', 'vitré', 'redon', 'dinard', 'morlaix',
    'dinan', 'lannion', 'guingamp', 'pontivy', 'auray', 'quimperlé',
    'concarneau', 'douarnenez', 'landerneau',
    // Bretagne — identifiants régionaux / départementaux
    'bretagne', 'finistère', 'morbihan', 'côtes-d\'armor', 'ille-et-vilaine',
    'ille et vilaine', 'cotes d\'armor', 'côtes d\'armor',
    // Pays de la Loire — villes principales
    'nantes', 'saint-nazaire', 'angers', 'le mans', 'la roche-sur-yon',
    'laval', 'cholet', 'saumur', 'la baule', 'ancenis', 'châteaubriant',
    'saint-herblain', 'rezé', 'saint-sébastien', 'vertou',
    'les sables-d\'olonne', 'fontenay-le-comte', 'challans',
    // Pays de la Loire — identifiants régionaux / départementaux
    'pays de la loire', 'pays de loire', 'loire-atlantique', 'maine-et-loire',
    'mayenne', 'sarthe', 'vendée', 'loire atlantique', 'maine et loire',
  ];

  // ── Mots-clés de recrutement (FR + EN) ────────────────────────
  // Classés du plus fort signal au plus faible.
  const RECRUIT_KEYWORDS = [
    // Signaux forts
    'nous recrutons', 'on recrute', 'we are hiring', 'we\'re hiring',
    'join our team', 'rejoignez notre équipe', 'rejoindre notre équipe',
    'poste ouvert', 'poste à pourvoir', 'offre d\'emploi', 'job opening',
    'offre de mission', 'mission freelance',
    // Signaux modérés
    'nous recherchons', 'on recherche', 'we are looking for',
    'profil recherché', 'we\'re looking for', 'hiring now',
    'cdi', 'cdd à', 'contrat freelance', 'mission en', 'prestation ',
    'recrute un', 'recrute une', 'recrutons un', 'recrutons une',
    // En anglais
    'software engineer', 'developer wanted', 'open role', 'open position',
  ];

  // État partagé : posts détectés sur le fil courant
  const _detectedPosts = new Map(); // key = postId, value = postData

  // ── Détection localisation → région ───────────────────────────
  function isInTargetRegion(locationText) {
    if (!locationText) return null; // inconnu — ne pas bloquer
    const lower = locationText.toLowerCase();
    return REGION_KEYWORDS.some((kw) => lower.includes(kw));
  }

  // ── Détection post de recrutement ─────────────────────────────
  // Les mots courts (≤5 chars) sont vérifiés avec \b pour éviter
  // les faux positifs ("cdi" dans "acaDémie", "cdd" dans "fcdd", etc.)
  const _RECRUIT_SHORT_RE = new RegExp(
    '\\b(' + RECRUIT_KEYWORDS.filter((kw) => kw.length <= 5).map((kw) =>
      kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('|') + ')\\b',
    'i'
  );

  function isRecruitPost(text) {
    const lower = text.toLowerCase();
    return RECRUIT_KEYWORDS.some((kw) =>
      kw.length <= 5 ? _RECRUIT_SHORT_RE.test(text) : lower.includes(kw)
    );
  }

  // ── Extraction des données d'un post ──────────────────────────
  //
  // LinkedIn peut utiliser différentes structures selon le type de post
  // (texte seul, article, partage, etc.). On essaie plusieurs sélecteurs
  // et on retourne la première valeur non vide trouvée.

  function extractPostData(postEl) {
    // Texte principal du post
    const textEl = postEl.querySelector([
      '[class*="update-components-text"]',
      '[class*="feed-shared-update-v2__description"]',
      '[class*="feed-shared-text"]',
      '[class*="attributed-text-segment-list"]',
      'span[dir="ltr"]',
    ].join(', '));
    const postText = textEl?.innerText?.trim() || postEl.innerText?.trim() || '';

    // Auteur — nom
    const authorNameEl = postEl.querySelector([
      '[class*="update-components-actor__name"]',
      '[class*="feed-shared-actor__name"]',
      '[class*="actor__name"]',
      'span[class*="visually-hidden"]', // LinkedIn cache parfois le nom dans un span accessible
    ].join(', '));
    const authorName = authorNameEl?.innerText?.trim() || '';

    // Auteur — URL LinkedIn (/in/slug)
    const authorLinkEl = postEl.querySelector('a[href*="/in/"]');
    const authorUrl = authorLinkEl?.href?.split('?')[0] || '';

    // Auteur — description/poste
    const headlineEl = postEl.querySelector([
      '[class*="update-components-actor__description"]',
      '[class*="feed-shared-actor__description"]',
      '[class*="actor__description"]',
    ].join(', '));
    const authorHeadline = headlineEl?.innerText?.trim() || '';

    // Auteur — localisation (souvent affichée sous le titre de poste)
    const subDescEl = postEl.querySelector([
      '[class*="update-components-actor__sub-description"]',
      '[class*="feed-shared-actor__sub-description"]',
      '[class*="actor__sub-description"]',
    ].join(', '));
    const locationText = subDescEl?.innerText?.trim() || '';

    // URL du post
    const timeEl   = postEl.querySelector('time');
    const postLink = timeEl?.closest('a') || postEl.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
    const postUrl  = postLink?.href?.split('?')[0] || window.location.href;

    // ID du post (pour dédupliquer)
    // Fallback : hash djb2 déterministe sur les 100 premiers chars du texte
    // → même post chargé deux fois → même ID → pas de doublon dans _detectedPosts
    const _hashFallback = (str) => {
      let h = 5381;
      for (let i = 0; i < Math.min(str.length, 100); i++) h = (Math.imul(33, h) ^ str.charCodeAt(i)) >>> 0;
      return h.toString(36);
    };
    const postId = postEl.dataset?.urn
      || postEl.getAttribute('data-id')
      || postUrl
      || _hashFallback(postText);

    return { postId, postText, authorName, authorUrl, authorHeadline, locationText, postUrl };
  }

  // ── Injection du bouton 💼 sur un post ────────────────────────
  //
  // Le bouton est positionné en absolu dans le coin haut-droit du post.
  // On s'assure que le post est en position relative pour que ça fonctionne.
  // Le style est minimaliste pour ne pas perturber l'UI LinkedIn.

  function injectCaptureButton(postEl, postData) {
    if (postEl.querySelector('.li-feed-capture-btn')) return; // déjà injecté

    const inRegion = isInTargetRegion(postData.locationText);

    const btn        = document.createElement('button');
    btn.className    = 'li-feed-capture-btn';
    btn.dataset.postId = postData.postId;

    // Emoji selon la certitude géographique
    if (inRegion === true)  { btn.textContent = '💼'; btn.title = `Capturer — ${postData.locationText}`; }
    else if (inRegion === null) { btn.textContent = '📋'; btn.title = 'Capturer ce post (localisation inconnue)'; }
    else { return; } // Hors région identifiée → ne pas injecter

    btn.style.cssText = [
      'position:absolute', 'top:10px', 'right:12px',
      'background:#0a66c2', 'color:#fff',
      'border:none', 'border-radius:50%',
      'width:30px', 'height:30px',
      'font-size:14px', 'line-height:30px', 'text-align:center',
      'cursor:pointer', 'z-index:9999',
      'box-shadow:0 2px 6px rgba(0,0,0,.25)',
      'transition:background .15s',
    ].join(';');

    btn.addEventListener('mouseenter', () => { btn.style.background = '#004182'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#0a66c2'; });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      capturePostViaBackground(postData, btn);
    });

    // S'assurer que le parent peut accueillir un enfant absolu
    const pos = getComputedStyle(postEl).position;
    if (pos === 'static') postEl.style.position = 'relative';

    postEl.appendChild(btn);
  }

  // ── Envoi d'un post à background.js pour analyse + Airtable ──
  async function capturePostViaBackground(postData, btn) {
    btn.textContent = '⏳';
    btn.style.background = '#888';
    btn.disabled = true;

    chrome.runtime.sendMessage(
      { type: 'CAPTURE_POST', ...postData },
      (response) => {
        if (response?.success) {
          btn.textContent = '✅';
          btn.style.background = '#057642';
          _detectedPosts.delete(postData.postId); // marqué comme capturé
        } else {
          btn.textContent = '❌';
          btn.style.background = '#cc1016';
          btn.disabled = false;
          btn.title = response?.error || 'Erreur de capture';
        }
      }
    );
  }

  // ── Scan des posts visibles dans le fil ───────────────────────
  //
  // On cherche les blocs de posts avec les sélecteurs les plus stables :
  //   data-urn       → identifiant stable du post (format urn:li:activity:...)
  //   occludable-update → classe historique de LinkedIn pour les posts du fil
  //   [class*="feed-shared-update-v2"] → variante moderne
  //
  // Chaque post est scanné une seule fois (dataset.liScanned = '1').

  function scanFeedPosts() {
    const candidates = document.querySelectorAll([
      '[data-urn*="activity"]',
      '[class*="occludable-update"]',
      '[class*="feed-shared-update-v2"]',
      'article[class*="update"]',
    ].join(', '));

    for (const postEl of candidates) {
      if (postEl.dataset.liScanned) continue;
      postEl.dataset.liScanned = '1';

      const data = extractPostData(postEl);
      if (!data.postText || !isRecruitPost(data.postText)) continue;

      // Stocker dans la map pour le comptage depuis le popup
      _detectedPosts.set(data.postId, data);

      // Injecter le bouton (Option A)
      injectCaptureButton(postEl, data);
    }
  }

  // ── MutationObserver : re-scanner quand le fil charge de nouveaux posts ──
  // Debounce 300 ms : LinkedIn génère des dizaines de mutations/seconde au scroll.
  // Sans debounce, scanFeedPosts() serait appelé en rafale et bloquerait le thread.
  let _feedObserver = null;
  let _scanTimer    = null;

  function startFeedObserver() {
    if (_feedObserver) return; // déjà actif
    _feedObserver = new MutationObserver(() => {
      clearTimeout(_scanTimer);
      _scanTimer = setTimeout(scanFeedPosts, 300);
    });
    _feedObserver.observe(document.body, { childList: true, subtree: true });
    scanFeedPosts(); // scan initial immédiat
  }

  // ── Démarrage automatique sur les pages feed/post ─────────────
  (function initFeedModule() {
    const pt = getPageType();
    if (pt === 'feed' || pt === 'post') {
      // Attendre que le DOM soit prêt (document_idle suffit souvent,
      // mais LinkedIn charge le fil en JS — on attend un peu)
      setTimeout(startFeedObserver, 1500);
    }
  })();

  // =============================================================
  // ─── ÉCOUTE DES MESSAGES DU POPUP ─────────────────────────────
  // =============================================================

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    if (msg.type === 'PING') {
      sendResponse({ pong: true, url: window.location.href, pageType: getPageType() });
      return false;
    }

    if (msg.type === 'SCRAPE_PROFILE') {
      scrapeProfile().then(sendResponse);
      return true;
    }

    if (msg.type === 'SCRAPE_COMPANY') {
      scrapeCompanyPage().then(sendResponse);
      return true;
    }

    // ── Comptage des posts détectés (pour affichage popup) ──────
    if (msg.type === 'GET_POST_COUNT') {
      sendResponse({
        count:    _detectedPosts.size,
        inRegion: [..._detectedPosts.values()].filter((p) => isInTargetRegion(p.locationText) === true).length,
      });
      return false;
    }

    // ── Capture manuelle de tous les posts détectés (Option C) ──
    if (msg.type === 'CAPTURE_ALL_POSTS') {
      const posts = [..._detectedPosts.values()];
      let done = 0;
      if (posts.length === 0) { sendResponse({ success: true, captured: 0 }); return false; }

      // Envoie chaque post à background.js séquentiellement
      // (éviter de spammer l'API Airtable/LLM en parallèle)
      (async () => {
        for (const postData of posts) {
          await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'CAPTURE_POST', ...postData }, () => {
              done++;
              // Mettre à jour le bouton inline si présent
              const btn = document.querySelector(`.li-feed-capture-btn[data-post-id="${postData.postId}"]`);
              if (btn) { btn.textContent = '✅'; btn.style.background = '#057642'; btn.disabled = true; }
              _detectedPosts.delete(postData.postId);
              resolve();
            });
          });
        }
        sendResponse({ success: true, captured: done });
      })();
      return true;
    }

  });

})();
