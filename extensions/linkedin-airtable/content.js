// Content script LinkedIn — scraping robuste

(function () {

  function text(el) {
    return el ? (el.innerText || el.textContent || "").trim() : "";
  }

  function waitFor(sel, ms = 3000) {
    return new Promise(resolve => {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(sel);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, ms);
    });
  }

  // ── Scraping principal (texte + photo) ─────────────────────────────────────
  async function scrapeProfile() {
    await waitFor("main", 3000);
    await new Promise(r => setTimeout(r, 800));

    // Force le lazy-load : LinkedIn ne rend les sections (Expérience, Formation…)
    // que lorsqu'elles approchent du viewport. On scrolle progressivement toute la
    // page, puis on revient en haut, pour garantir que tout le DOM est rendu.
    try {
      const h = () => document.body.scrollHeight;
      for (let i = 1; i <= 6; i++) {
        window.scrollTo(0, (h() * i) / 6);
        await new Promise(r => setTimeout(r, 400));
      }
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { /* scroll best-effort */ }

    const p = {};

    // Nom (LinkedIn utilise H2, pas H1)
    const nameEl = Array.from(document.querySelectorAll("main h2")).find(el => {
      const t = text(el);
      return t.length > 2 && !t.match(/^(Activit|Exp|Formation|Comp|Recomm|Centres)/i);
    });
    p.fullName = text(nameEl);
    const parts = p.fullName.split(/\s+/);
    const last = parts[parts.length - 1];
    if (last === last.toUpperCase() && last.length > 1) {
      p.lastName = last; p.firstName = parts.slice(0, -1).join(" ");
    } else {
      p.firstName = parts[0] || ""; p.lastName = parts.slice(1).join(" ") || "";
    }

    // Poste + Entreprise (premier <P> substantiel)
    const ps = Array.from(document.querySelectorAll("main p"));
    const posEl = ps.find(el => {
      const t = text(el);
      return t.length > 15 && !t.startsWith("·") && !t.match(/^\d/);
    });
    const posText = text(posEl);
    let split = false;
    for (const sep of [" chez ", " at ", " @ "]) {
      if (posText.includes(sep)) {
        const i = posText.indexOf(sep);
        p.position = posText.substring(0, i).trim();
        p.company  = posText.substring(i + sep.length).trim();
        split = true; break;
      }
    }
    if (!split) {
      p.position = posText;
      const idx = ps.indexOf(posEl);
      p.company = idx >= 0 ? text(ps[idx + 1]).split("·")[0].trim() : "";
    }

    p.linkedinUrl = location.href.split("?")[0];

    // URL de la page entreprise du DERNIER EMPLOYEUR.
    // Stratégie fiable : on a déjà le NOM de l'entreprise (p.company). On cherche
    // donc le lien /company/ dont le texte d'ancrage correspond à ce nom.
    p.companyUrl = "";
    const companyLinks = Array.from(document.querySelectorAll('main a[href*="/company/"]'))
      .filter(a => /\/company\/[^\/?#]+/.test((a.href || "").split("?")[0]));

    // Normalise pour comparer (minuscules, sans accents/espaces superflus)
    const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const companyNorm = norm(p.company);

    // Nettoie une URL d'entreprise : retire query, sous-pages (/posts, /about…) et slash final
    const cleanCompanyUrl = href => (href || "").split("?")[0]
      .replace(/\/(posts|about|life|people|jobs)\/?$/i, "")
      .replace(/\/$/, "");

    if (companyNorm) {
      // 1. Match exact ou partiel entre le texte du lien et le nom d'entreprise scrapé.
      //    On exige un texte d'au moins 3 caractères pour éviter les liens vides (icônes).
      const match = companyLinks.find(a => {
        const linkText = norm(a.innerText);
        const ariaLabel = norm(a.getAttribute("aria-label"));
        return (linkText.length >= 3 && (linkText.includes(companyNorm) || companyNorm.includes(linkText))) ||
               (ariaLabel.length >= 3 && ariaLabel.includes(companyNorm));
      });
      if (match) p.companyUrl = cleanCompanyUrl(match.href);
    }

    // 2. Fallback : lien /company/ situé dans le bloc "Expérience" (section dédiée)
    if (!p.companyUrl) {
      const expSection = Array.from(document.querySelectorAll("main section")).find(sec => {
        const h = sec.querySelector("h2, h3");
        return h && /^(Expérience|Experience)$/i.test((h.innerText || "").trim());
      });
      if (expSection) {
        const link = expSection.querySelector('a[href*="/company/"]');
        if (link) p.companyUrl = cleanCompanyUrl(link.href);
      }
    }

    // Localisation — elle se trouve sous le poste, dans le même conteneur que le
    // lien "Coordonnées", au format "Ville, Région · Coordonnées"
    p.location = "";
    // Méthode 1 (sémantique, fiable) : conteneur du lien Coordonnées → texte avant le "·"
    const coordLink = Array.from(document.querySelectorAll("main a")).find(a =>
      /^(Coordonnées|Contact info)$/i.test((a.innerText || "").trim()) ||
      (a.href || "").includes("contact-info"));
    if (coordLink) {
      const container = coordLink.closest("div");
      if (container) {
        const raw = (container.innerText || "").split("·")[0].trim();
        // Garde-fou : pas de contacts en commun ni de relations capturés par erreur
        if (raw && raw.length < 100 && !/relation|contact|coordonn/i.test(raw)) {
          p.location = raw;
        }
      }
    }
    // Méthode 2 (fallback) : span dédié à la localisation (classes utilitaires LinkedIn)
    if (!p.location) {
      const locSpan = document.querySelector(
        "span.text-body-small.inline.t-black--light.break-words");
      if (locSpan) {
        const raw = (locSpan.innerText || "").trim();
        if (raw && raw.length < 100 && !/relation|contact/i.test(raw)) p.location = raw;
      }
    }

    // Photo du profil. DÉCOUVERTES CLÉS (vérifiées sur DOM réel de plusieurs profils) :
    //  - certains profils ont l'alt = nom de la personne, d'autres ont un alt VIDE ;
    //  - la photo principale est toujours la PLUS GRANDE "profile-displayphoto"
    //    (152px affichés) vs 24/48px pour les vignettes de contacts/activités ;
    //  - LinkedIn affiche d'abord un placeholder base64 sur la grande image, puis
    //    remplace le src par la vraie URL https → COURSE AU CHARGEMENT à gérer.
    p.photoUrl = "";
    const normName = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const meNorm = normName(p.fullName);
    const isHttps = src => /^https:\/\//.test(src || "");

    // 1. Identifie l'ÉLÉMENT photo principal.
    //    DISCRIMINANT FIABLE : naturalWidth (taille réelle de l'image décodée) — la
    //    vraie photo fait ~698px vs ~100px pour les vignettes. Contrairement à
    //    clientWidth, naturalWidth fonctionne MÊME dans un onglet en arrière-plan
    //    (mode batch), car il ne dépend pas du rendu/layout à l'écran.
    const allDisplay = Array.from(
      document.querySelectorAll("main img[src*='profile-displayphoto']")
    );

    let photoEl = null;
    // Priorité à l'alt = nom de la personne (profils "anciens" où l'alt est rempli)
    if (meNorm) {
      photoEl = allDisplay.find(img => normName(img.alt).includes(meNorm)) || null;
    }
    // Sinon : l'image à la plus grande résolution réelle (naturalWidth), fallback clientWidth
    if (!photoEl) {
      let bestSize = 0;
      for (const img of allDisplay) {
        const size = Math.max(img.naturalWidth || 0, img.clientWidth || 0);
        if (size > bestSize) { bestSize = size; photoEl = img; }
      }
    }

    // 2. Récupère son URL https. Si le src est encore un placeholder base64,
    //    on attend jusqu'à 2,5s que LinkedIn charge la vraie image.
    if (photoEl) {
      if (isHttps(photoEl.src)) {
        p.photoUrl = photoEl.src;
      } else {
        for (let i = 0; i < 10 && !isHttps(photoEl.src); i++) {
          await new Promise(r => setTimeout(r, 250));
        }
        if (isHttps(photoEl.src)) p.photoUrl = photoEl.src;
      }
    }

    // 3. Fallback ultime : n'importe quelle displayphoto https déjà chargée
    if (!p.photoUrl) {
      const anyHttps = Array.from(document.querySelectorAll("main img[src*='profile-displayphoto']"))
        .find(img => isHttps(img.src));
      if (anyHttps) p.photoUrl = anyHttps.src;
    }

    // ── Sections détaillées via les ANCRES LinkedIn (#about / #experience / #education) ──
    // Bien plus fiable que le match par titre (LinkedIn duplique le texte pour les
    // lecteurs d'écran → "ExpérienceExpérience", ce qui cassait l'ancien match exact).

    // Extrait le texte VISIBLE propre : LinkedIn met le texte affiché dans des
    // span[aria-hidden="true"] (le reste est du texte lecteur-d'écran dupliqué).
    function visibleText(el) {
      if (!el) return "";
      const spans = el.querySelectorAll('span[aria-hidden="true"]');
      if (spans.length) {
        return [...new Set(Array.from(spans).map(s => text(s)).filter(Boolean))].join(" — ");
      }
      return text(el);
    }

    // Trouve la section par son ancre id, avec fallback titre (tolérant pluriel/duplication)
    function findSection(anchorId, titleRegex) {
      const a = document.getElementById(anchorId);
      if (a) { const s = a.closest("section"); if (s) return s; }
      for (const sec of document.querySelectorAll("main section")) {
        const h = sec.querySelector("h2, h3");
        const ht = h ? text(h).split("\n")[0].trim() : "";
        if (ht && titleRegex.test(ht)) return sec;
      }
      return null;
    }

    // Extrait les items d'une section : un par <li> FEUILLE (sans <li> imbriqué)
    function sectionItems(sec, max) {
      if (!sec) return [];
      const out = [];
      const leafLis = Array.from(sec.querySelectorAll("li")).filter(li => !li.querySelector("li"));
      for (const li of leafLis) {
        const line = visibleText(li).replace(/\s+/g, " ").trim().substring(0, 250);
        if (line.length > 10 && !out.includes(line)) out.push(line);
        if (out.length >= max) break;
      }
      return out;
    }

    // À propos — développe via "Plus" puis prend le texte visible
    p.summary = "";
    const aboutSec = findSection("about", /^(À propos|About)/i);
    if (aboutSec) {
      const moreBtn = Array.from(aboutSec.querySelectorAll("button")).find(btn => {
        const t = (btn.innerText || btn.textContent || "").trim();
        return /plus|more|voir|expand|show/i.test(t) && t.length < 20;
      });
      if (moreBtn) { try { moreBtn.click(); await new Promise(r => setTimeout(r, 600)); } catch (e) {} }
      const raw = visibleText(aboutSec).replace(/^(À propos|About)\s*(—\s*)?/i, "").trim();
      if (raw.length > 20) p.summary = raw;
    }

    // Expériences + Formations
    p.experiences = sectionItems(findSection("experience", /^(Exp[ée]riences?|Experiences?)/i), 12);
    p.education   = sectionItems(findSection("education",  /^(Formations?|[ÉE]ducation)/i), 10);

    // Email + Téléphone : gérés côté background via onglet dédié
    // (LinkedIn rend le contenu en JS, un simple fetch ne suffit pas)
    p.email = ""; p.phone = "";

    // URL vers la page des relations en commun (la liste complète est scrapée
    // côté background). Le lien contient un paramètre connectionOf spécifique.
    p.mutualUrl = "";
    const mutualLink = Array.from(document.querySelectorAll("main a"))
      .find(a => /relation.*commun|relations? en commun|mutual connection/i.test(a.innerText || ""));
    if (mutualLink) p.mutualUrl = mutualLink.href;

    return p;
  }

  // ── Listeners ──────────────────────────────────────────────────────────────
  // Le PDF natif est désormais géré entièrement dans background.js
  // via chrome.scripting.executeScript world:"MAIN" (seule façon d'intercepter
  // le vrai window.fetch de LinkedIn — les content scripts sont dans un monde isolé)
  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req.action === "scrapeProfile") {
      scrapeProfile()
        .then(data => sendResponse({ success: true, data }))
        .catch(err  => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });

})();
