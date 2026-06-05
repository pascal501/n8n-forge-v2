// Service Worker

importScripts("pdf-generator.js");

// ─── Airtable ─────────────────────────────────────────────────────────────────

async function airtableRequest(token, method, path, body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`https://api.airtable.com/v0${path}`, opts);
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || JSON.stringify(json));
  return json;
}

async function getFieldId(token, baseId, tableId, fieldName) {
  const key = `fids_${baseId}_${tableId}`;
  const stored = await chrome.storage.local.get(key);
  let map = stored[key];
  if (!map) {
    const schema = await airtableRequest(token, "GET", `/meta/bases/${baseId}/tables`);
    const table  = schema.tables?.find(t => t.id === tableId);
    if (!table) throw new Error(`Table ${tableId} introuvable`);
    map = {};
    table.fields.forEach(f => { map[f.name] = f.id; });
    await chrome.storage.local.set({ [key]: map });
  }
  return map[fieldName] || null;
}

async function uploadAttachment(token, baseId, tableId, recordId, fieldName, filename, dataUrl) {
  const fieldId = await getFieldId(token, baseId, tableId, fieldName);
  if (!fieldId) throw new Error(`Champ "${fieldName}" introuvable — ajoutez le scope schema.bases:read à votre token Airtable`);
  const [meta, b64] = dataUrl.split(",");
  const contentType = meta.replace("data:", "").replace(";base64", "");
  const resp = await fetch(
    `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, filename, file: b64 }),
    }
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || JSON.stringify(json));
  return json;
}

// Cherche un contact existant par son URL LinkedIn (gestion des doublons)
// Retourne l'ID du record si trouvé, sinon null.
async function findExistingRecord(token, baseId, tableId, linkedinUrl) {
  if (!linkedinUrl) return null;
  // Échappe les guillemets pour la formule Airtable
  const safeUrl = linkedinUrl.replace(/"/g, '\\"');
  const formula = `{LinkedIn URL} = "${safeUrl}"`;
  const path = `/${baseId}/${tableId}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  try {
    const result = await airtableRequest(token, "GET", path);
    // Retourne l'objet record complet (id + fields) pour permettre le calcul du delta
    return result.records?.[0] || null;
  } catch (e) {
    console.warn("[LinkedIn→Airtable] Recherche doublon échouée:", e.message);
    return null; // en cas d'erreur, on crée un nouveau record
  }
}

// ─── Extras via onglet background : email, téléphone, contacts en commun ──────
// Un seul onglet caché pour tout :
//   1. charge le profil → clique "Coordonnées" → lit mailto:/tel:
//   2. navigue vers la page des relations en commun → scrape noms + URLs

// Convertit une date LinkedIn ("12 mars 2023" ou "March 12, 2023") au format
// ISO "YYYY-MM-DD" attendu par Airtable. Retourne "" si non parsable.
function parseConnectedDate(raw) {
  if (!raw) return "";
  const months = {
    janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
    august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const norm = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Format FR : "12 mars 2023"
  let m = norm.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m) {
    const mon = months[m[2]];
    if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  // Format EN : "march 12, 2023"
  m = norm.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = months[m[1]];
    if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  return "";
}

async function getProfileExtras(linkedinUrl, mutualUrl) {
  // Normalise le sous-domaine pays (fr./dz./hk./be./ca…) vers www. : le content
  // script n'est garanti que sur www.linkedin.com, et www sert le profil authentifié complet.
  const profileUrl = linkedinUrl.replace(/\/$/, "").split("?")[0]
    .replace(/^(https?:\/\/)[a-z]{2,3}\.linkedin\.com/i, "$1www.linkedin.com") + "/";
  // active: true → l'onglet s'affiche, donnant un VRAI viewport à LinkedIn, qui ne
  // charge les sections About/Expérience/Formation que lorsqu'elles deviennent
  // visibles (IntersectionObserver). En onglet caché, elles restaient vides.
  const tab = await chrome.tabs.create({ url: profileUrl, active: true });
  const out = { email: "", phone: "", website: "", connectedRaw: "", mutualContacts: [] };

  // Helper : attend que l'onglet ait fini de charger
  function waitTabComplete(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Tab load timeout")), timeoutMs);
      function onUpdate(tabId, info) {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          clearTimeout(timer);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdate);
    });
  }

  try {
    await waitTabComplete();
    await new Promise(r => setTimeout(r, 3000)); // attend React

    // ── 1. Coordonnées ───────────────────────────────────────────────────────
    const clicked = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const link = Array.from(document.querySelectorAll("a"))
          .find(a => /^(Coordonnées|Contact info)$/i.test((a.innerText || "").trim()));
        if (link) { link.click(); return true; }
        return false;
      },
    });

    if (clicked[0]?.result) {
      await new Promise(r => setTimeout(r, 2500));
      const contact = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Cible le panneau modal des coordonnées (sinon tout le document)
          const modal = document.querySelector('[role="dialog"], .artdeco-modal') || document;

          // EMAIL — le href mailto: est fiable
          const emailA = modal.querySelector('a[href^="mailto:"]');
          const email = emailA?.href?.replace("mailto:", "").trim() || "";

          // NB : sur LinkedIn, les liens Website/Téléphone affichent la bonne valeur
          // en TEXTE mais leur href est une redirection LinkedIn → on parse le texte
          // de la section concernée, pas le href.
          let phone = "", website = "";
          modal.querySelectorAll("section, li, div").forEach(sec => {
            const t = (sec.innerText || "").trim();
            // SITE WEB
            if (!website && /^(Site web|Website|Site internet)/i.test(t)) {
              const m = t.match(/https?:\/\/[^\s)]+/);
              if (m && !/linkedin\.com/i.test(m[0])) website = m[0];
            }
            // TÉLÉPHONE
            if (!phone && /^(Téléphone|Phone|Mobile|Portable|Tél)/i.test(t)) {
              const m = t.match(/[\+\d][\d\s\-\.\(\)]{6,20}/);
              if (m) phone = m[0].trim();
            }
          });
          // Fallback téléphone : lien tel: si le parsing texte n'a rien donné
          if (!phone) {
            const phoneA = modal.querySelector('a[href^="tel:"]');
            if (phoneA) phone = phoneA.href.replace("tel:", "").trim();
          }

          // DATE DE CONNEXION — LinkedIn affiche "Connecté(e) depuis\n\n3 mars 2023"
          // dans le panneau Coordonnées (le mot et la date sont dans des sous-éléments,
          // d'où la recherche d'un bloc court mentionnant "connect" + une année).
          let connectedRaw = "";
          const allEls = Array.from(modal.querySelectorAll("section, li, div, span"));
          for (const el of allEls) {
            const t = (el.innerText || "").trim();
            if (/connect(é|e|ed)/i.test(t) && /\d{4}/.test(t) && t.length < 120) {
              const m = t.match(/\d{1,2}\s+\p{L}+\s+\d{4}|\p{L}+\s+\d{1,2},?\s+\d{4}/u);
              if (m) { connectedRaw = m[0].trim(); break; }
            }
          }

          return { email, phone, website, connectedRaw };
        },
      });
      if (contact[0]?.result) {
        out.email       = contact[0].result.email       || "";
        out.phone       = contact[0].result.phone       || "";
        out.website     = contact[0].result.website     || "";
        out.connectedRaw = contact[0].result.connectedRaw || "";
      }
    }

    // ── 2. Contacts en commun ─────────────────────────────────────────────────
    if (mutualUrl) {
      await chrome.tabs.update(tab.id, { url: mutualUrl });
      await waitTabComplete();
      await new Promise(r => setTimeout(r, 2500)); // attend les résultats

      const mutual = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const seen = new Set();
          const list = [];
          document.querySelectorAll('a[href*="/in/"]').forEach(a => {
            const href = (a.href || "").split("?")[0];
            // Nom = 1ère ligne, nettoyée du degré de relation
            let name = (a.innerText || "").trim().split("\n")[0].trim();
            name = name.replace(/\s*[•·]\s*\d+(er|e|nd|rd|th)?\s*$/i, "")    // "• 1er"
                       .replace(/\s*\d+(er|e|nd|rd|th)\s*$/i, "")
                       .trim();
            if (!href.includes("/in/")) return;
            if (!name || name.length < 2 || name.length > 60) return;
            if (/^(voir|view|membre|member|linkedin)/i.test(name)) return;
            if (seen.has(href)) return;
            seen.add(href);
            list.push({ name, url: href });
          });
          return list.slice(0, 50);
        },
      });
      if (mutual[0]?.result) out.mutualContacts = mutual[0].result;
    }

    return out;
  } catch (e) {
    console.warn("[LinkedIn→Airtable] getProfileExtras:", e.message);
    return out;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ─── Résumé du profil via Gemini (modèle gratuit gemini-2.0-flash) ────────────
// 3 prompts distincts selon la classification : Prospect (client/vente), Ressource (RH/placement), Généraliste
async function generateGeminiSummary(apiKey, profile, mutualContacts, classifications = {}) {
  const mutualNames = (mutualContacts || []).map(c => c.name).join(", ");

  // Données du profil envoyées à Gemini — on lui donne TOUT le factuel scrapé
  // (expériences + formations comprises) pour qu'il analyse au lieu d'inventer.
  const expText = (profile.experiences || []).slice(0, 12).join("\n");
  const eduText = (profile.education || []).slice(0, 8).join("\n");
  const profileData = [
    `Nom : ${profile.fullName || ""}`,
    `Poste actuel : ${profile.position || ""}`,
    `Entreprise actuelle : ${profile.company || ""}`,
    profile.location ? `Localisation : ${profile.location}` : "",
    expText ? `Expériences (extraites du profil) :\n${expText}` : "",
    eduText ? `Formations (extraites du profil) :\n${eduText}` : "",
    mutualNames ? `Relations en commun : ${mutualNames}` : "",
    // Source de vérité : TOUT le texte visible de la page (à propos, expériences,
    // formations, compétences…). Gemini doit analyser CECI en priorité.
    profile.rawText ? `\n=== CONTENU COMPLET VISIBLE DE LA PAGE (source de vérité — analyse ceci) ===\n${profile.rawText}` : "",
  ].filter(Boolean).join("\n");

  let prompt;

  if (classifications.prospect && !classifications.resource) {
    // ── PROSPECT : orientation CLIENT/VENTE ────────────────────────────────
    prompt =
      "Tu rédiges une **fiche d'approche client stratégique** pour un commercial ESN qui veut le prospecter. " +
      "Cette personne est un client/décideur potentiel. À partir des données ci-dessous, " +
      "rédige en français un résumé **détaillé** (7 à 10 phrases) qui identifie :\n" +
      "1. **Qui est cette personne ?** Rôle, responsabilités, pouvoir de décision probable ?\n" +
      "2. **Secteur & contexte business** : Quels enjeux IT/digitaux pour son industrie ?\n" +
      "3. **Expertise/parcours** : Quels domaines a-t-il couverts ? Ça dit quoi sur ses besoins IT ?\n" +
      "4. **Stabilité/positionnement** : Est-il en poste stable ? En transition ? Signal de changement ?\n" +
      "5. **Angle commercial** : Comment l'aborder ? Quel besoin/solution ESN pourrait l'intéresser ?\n" +
      "6. **Connexions** : Y a-t-il des relations en commun pour une warm intro ?\n\n" +
      "Sois stratégique et commercial. Focus : comment le vendre à ce client potentiel ?\n\n--- CLIENT/PROSPECT ---\n" + profileData;

  } else if (classifications.resource && !classifications.prospect) {
    // ── RESSOURCE : orientation RH/PLACEMENT ───────────────────────────────
    prompt =
      "Tu rédiges une **fiche candidat détaillée** pour un commercial ESN qui veut le placer en mission. " +
      "À partir des données ci-dessous, rédige en français un résumé **complet** (7 à 10 phrases) qui couvre :\n" +
      "1. **Expérience totale en années** (extrais du texte)\n" +
      "2. **Séniorité/niveau** (junior, confirmé, senior, expert/lead)\n" +
      "3. **Stack technique & compétences** (langages, frameworks, domaines IT maîtrisés)\n" +
      "4. **Parcours & anciennes boîtes** (trajectoire, secteurs, croissance, stabilité)\n" +
      "5. **Profil de mobilité** : Cherche de la stabilité ? Du leadership ? Spécialisation ? Polyvalence ?\n" +
      "6. **Positionnement placement** : Pour quel type de mandat/mission/client le proposer ?\n\n" +
      "Sois clair sur la valeur placement/RH. Focus : pour quel mandat/client le matcher ?\n\n--- RESSOURCE/CANDIDAT ---\n" + profileData;

  } else {
    // ── GÉNÉRALISTE : résumé neutre, équilibré ────────────────────────────
    prompt =
      "Tu rédiges une **fiche de synthèse généraliste détaillée** sur cette personne. " +
      "À partir des données ci-dessous, rédige en français un résumé **complet** (7 à 10 phrases) qui couvre :\n" +
      "1. **Profil général** : poste, entreprise, séniorité\n" +
      "2. **Expérience en années & domaines** couverts\n" +
      "3. **Parcours professionnel** : anciennes boîtes, trajectoire générale\n" +
      "4. **Contexte actuel** : stabilité, changements visibles, évolution en cours ?\n" +
      "5. **Caractéristiques clés** : ce qui le définit professionnellement\n" +
      "6. **Relations** : connexions en commun si pertinentes ?\n\n" +
      "Sois factuel, neutre, sans orientation commerciale particulière.\n\n--- PROFIL ---\n" + profileData;
  }

  // Règle ABSOLUE anti-hallucination — la priorité sur tout le reste
  prompt += "\n\n=== RÈGLE ABSOLUE — ZÉRO HALLUCINATION ===\n" +
    "- Utilise EXCLUSIVEMENT les informations présentes dans les données ci-dessus. " +
    "N'invente JAMAIS une entreprise, une date, une durée, un nombre d'années, un diplôme, " +
    "une compétence ou un fait qui n'y figure pas explicitement.\n" +
    "- Si une information demandée (années d'expérience, anciennes entreprises, formation, séniorité…) " +
    "n'est PAS dans les données fournies, NE L'INVENTE PAS : écris « non précisé » ou n'en parle pas du tout.\n" +
    "- Ton rôle est d'ANALYSER et SYNTHÉTISER le factuel fourni, PAS de combler les trous par des suppositions " +
    "plausibles. Une supposition plausible mais non vérifiée = une hallucination interdite.\n" +
    "- Reste TRÈS proche du texte source. Adapte la longueur à la matière disponible : " +
    "si le profil contient peu d'informations, fais un résumé COURT. Ne rallonge jamais en inventant.\n" +
    "- En cas de doute, choisis toujours la version factuelle et concise plutôt que détaillée et incertaine.\n\n" +
    "IMPORTANT : Commence DIRECTEMENT par le contenu de la fiche. " +
    "N'écris AUCUNE phrase d'introduction du type « Voici une fiche... » ni de titre, " +
    "ni de séparateurs « --- ». Va droit au but.";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1500,
        // IMPORTANT : gemini-2.5-flash active un mode "thinking" qui consomme tout
        // le budget de tokens en réflexion interne → réponse tronquée. On le coupe.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || `Gemini HTTP ${resp.status}`);
  let txt = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!txt) throw new Error("Réponse Gemini vide");

  // Nettoie un éventuel préambule conversationnel ("Voici une fiche...", "---", etc.)
  txt = txt
    .replace(/^(voici|here is|here's)[^\n]*:?\s*\n+/i, "")  // "Voici une fiche... :"
    .replace(/^[-–—\s]*\n+/, "")                             // séparateurs en tête
    .trim();
  return txt;
}

// Formate les contacts en commun en markdown (liens cliquables si champ rich text)
function formatMutualContacts(contacts) {
  if (!contacts || contacts.length === 0) return "";
  return contacts.map(c => `[${c.name}](${c.url})`).join("; ");
}

// ─── PDF natif LinkedIn ───────────────────────────────────────────────────────
// CORRECTION CLÉ : l'interception window.fetch DOIT se faire dans le monde
// PRINCIPAL de la page (world:"MAIN") — les content scripts sont dans un monde
// isolé et ne capturent pas les requêtes fetch du code JavaScript de LinkedIn.
//
// Flow :
//   1. Inject listener postMessage dans le monde isolé (a accès à chrome.runtime)
//   2. Inject intercepteur fetch dans le monde principal (a accès au vrai window.fetch)
//   3. Clique Plus → Enregistrer au format PDF
//   4. Intercepteur capte la réponse RSC → extrait URL ambry → fetch PDF
//   5. postMessage → relay vers background via chrome.runtime.sendMessage

async function getNativePDF(tabId, timeoutMs = 25000) {
  const nonce = "pdf_" + Date.now();

  // Promise résolue quand le background reçoit le message relay
  const pdfPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(relay);
      reject(new Error(`PDF timeout ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    function relay(msg) {
      if (msg._pdfNonce === nonce) {
        chrome.runtime.onMessage.removeListener(relay);
        clearTimeout(timer);
        msg.success ? resolve(msg.data) : reject(new Error(msg.error || "PDF failed"));
      }
    }
    chrome.runtime.onMessage.addListener(relay);
  });

  // 1. Monde isolé : écoute postMessage et le relaie au background
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (nonce) => {
      window.addEventListener("message", function pdfRelay(e) {
        if (e.data?._pdfNonce === nonce) {
          window.removeEventListener("message", pdfRelay);
          chrome.runtime.sendMessage(e.data);
        }
      });
    },
    args: [nonce],
  });

  // 2. Monde PRINCIPAL : intercepte window.fetch de LinkedIn
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (nonce) => {
      const orig = window.fetch;
      let done = false;

      window.fetch = async function (...args) {
        const resp = await orig.apply(this, args);
        const url = typeof args[0] === "string" ? args[0] : (args[0]?.url || "");

        if (!done && (url.includes("server-request") || url.includes("rsc-action"))) {
          resp.clone().text().then(async text => {
            const m = text.match(/https:\/\/www\.linkedin\.com\/ambry\/\?[^"\\}\s]{20,}/);
            if (!m || done) return;
            done = true;
            window.fetch = orig;

            try {
              const pr = await orig(m[0], { credentials: "include" });
              const bl = await pr.blob();
              const fr = new FileReader();
              fr.onloadend = () => {
                window.postMessage({ _pdfNonce: nonce, success: true, data: fr.result }, "*");
              };
              fr.readAsDataURL(bl);
            } catch (e) {
              window.postMessage({ _pdfNonce: nonce, success: false, error: e.message }, "*");
            }
          }).catch(e => {
            window.postMessage({ _pdfNonce: nonce, success: false, error: e.message }, "*");
          });
        }
        return resp;
      };
    },
    args: [nonce],
  });

  // 3. Clique Plus → Enregistrer au format PDF
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const plusBtns = Array.from(document.querySelectorAll("button"))
        .filter(b => b.innerText?.trim() === "Plus");
      (plusBtns[1] || plusBtns[0])?.click();
      setTimeout(() => {
        Array.from(document.querySelectorAll("div, li, [role=menuitem]"))
          .find(el => el.innerText?.trim() === "Enregistrer au format PDF")?.click();
      }, 700);
    },
  });

  return pdfPromise;
}

// ─── Photo de profil en base64 ────────────────────────────────────────────────
// L'URL CDN LinkedIn est signée et expire → Airtable échoue à la récupérer côté
// serveur. Solution : on télécharge l'image EN BASE64 dans le contexte de l'onglet
// LinkedIn (où le fetch réussit : 200), puis on l'upload via uploadAttachment (le
// même canal fiable que le PDF). Vérifié : fetch(url) SANS credentials fonctionne.
async function getPhotoBase64(tabId, photoUrl) {
  if (!tabId || !photoUrl) return null;
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (url) => {
        try {
          const resp = await fetch(url);               // sans credentials = OK (CORS)
          if (!resp.ok) return null;
          const blob = await resp.blob();
          return await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onloadend = () => resolve(fr.result);   // data:image/jpeg;base64,...
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(blob);
          });
        } catch (e) { return null; }
      },
      args: [photoUrl],
    });
    const dataUrl = res?.[0]?.result;
    return (dataUrl && dataUrl.startsWith("data:image")) ? dataUrl : null;
  } catch (e) {
    console.warn("[LinkedIn→Airtable] getPhotoBase64:", e.message);
    return null;
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveToAirtable") {
    handleSave(request.profile, request.config, request.tabId, request.classifications)
      .then(r => sendResponse({ success: true, recordId: r.id, details: r.details }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

async function handleSave(profile, config, tabId, classifications = {}) {
  const { token, baseId, tableId, geminiKey } = config;
  const details = { email: false, phone: false, photo: false, pdf: false,
                    pdfSource: "", mutual: 0, summary: "" };

  // 1. Extras via onglet caché : email, téléphone, site web, date connexion, contacts
  let email = "", phone = "", website = "", connectedDate = "", mutualContacts = [];
  if (profile.linkedinUrl) {
    const extras = await getProfileExtras(profile.linkedinUrl, profile.mutualUrl);
    if (extras.email) { email = extras.email; details.email = true; }
    if (extras.phone) {
      // Nettoyage du téléphone : chiffres seulement
      phone = extras.phone.replace(/[^0-9]/g, "");
      if (phone) details.phone = true;
    }
    if (extras.website) { website = extras.website; details.website = true; }
    if (extras.connectedRaw) {
      connectedDate = parseConnectedDate(extras.connectedRaw);  // → "YYYY-MM-DD"
      if (connectedDate) details.connected = true;
    }
    mutualContacts = extras.mutualContacts || [];
    details.mutual = mutualContacts.length;
  }

  // 2. Résumé IA via Gemini (si clé configurée), sinon on garde le "À propos" scrapé
  let profileSummary = profile.summary || "";
  if (geminiKey) {
    try {
      profileSummary = await generateGeminiSummary(geminiKey, profile, mutualContacts, classifications);
      details.summary = "Gemini";
    } catch (e) {
      console.warn("[LinkedIn→Airtable] Gemini:", e.message);
      details.summaryError = e.message;
      details.summary = profile.summary ? "À propos (Gemini échoué)" : "";
    }
  } else if (profile.summary) {
    details.summary = "À propos";
  }

  // 3. Champs texte
  const fields = {};
  // Profile Name : "Prénom Nom" (titre de la fiche)
  if (profile.fullName) fields["Profile Name"] = profile.fullName;
  if (profile.firstName)   fields["Prénom"]         = profile.firstName;
  if (profile.lastName)    fields["Nom"]             = profile.lastName;
  if (profile.position)    fields["Poste"]           = profile.position;
  if (profile.company)     fields["Company Name"]      = profile.company;
  if (profile.location)    fields["Location"]        = profile.location;
  if (profile.linkedinUrl) fields["LinkedIn URL"]    = profile.linkedinUrl;
  if (profile.companyUrl)  fields["Entreprise profile URL"]  = profile.companyUrl;
  if (profileSummary)      fields["Profile Summary"] = profileSummary;
  if (email)               fields["Email"]           = email;
  if (phone)               fields["Téléphone"]       = phone;
  if (website)             fields["Site web"]        = website;
  if (connectedDate)       fields["Connecté le"]     = connectedDate;

  // Contacts en commun (markdown : cliquable si le champ est en rich text)
  const mutualMd = formatMutualContacts(mutualContacts);
  if (mutualMd) fields["Contacts en communs"] = mutualMd;

  // Checkboxes : Confirmed as Prospect / Confirmed as Resource
  if (classifications.prospect !== undefined) fields["Confirmed as Prospect"] = classifications.prospect;
  if (classifications.resource !== undefined) fields["Confirmed as Resource"] = classifications.resource;

  // 3. Photo : on NE passe PLUS par [{url}] (Airtable n'arrive pas à récupérer l'URL
  //    CDN signée/expirée). On uploadera l'image en base64 plus bas, après avoir le
  //    recordId, via uploadAttachment — comme pour le PDF.

  // 4. Doublon ? Cherche un contact existant par URL LinkedIn
  const existing = await findExistingRecord(token, baseId, tableId, profile.linkedinUrl);

  let recordId;
  if (existing) {
    // ── MISE À JOUR du contact existant ──────────────────────────────────────
    details.mode = "mise à jour";

    // Historisation : une seule entrée datée (+ delta des changements) en tête de Notes
    const old = existing.fields || {};
    // PROTECTION : Email + Téléphone ne sont jamais écrasés
    if (old["Email"]) delete fields["Email"];
    if (old["Téléphone"]) delete fields["Téléphone"];

    const { entry, changeCount } = buildHistoryEntry(old, {
      location: profile.location, company: profile.company,
      companyUrl: profile.companyUrl, email, phone,
    });
    details.deltaCount = changeCount;

    const prevNotes = (old["Notes"] || "").toString();
    fields["Notes"] = prevNotes ? `${entry}\n\n${"─".repeat(30)}\n\n${prevNotes}` : entry;

    // Vide le champ Profile PDF avant le re-upload (sinon Airtable cumule les PJ)
    fields["Profile PDF"] = [];
    const updated = await airtableRequest(
      token, "PATCH", `/${baseId}/${tableId}`,
      { records: [{ id: existing.id, fields }] }
    );
    recordId = updated.records[0].id;
  } else {
    // ── CRÉATION d'un nouveau contact ────────────────────────────────────────
    details.mode = "création";

    // Historise aussi la création : première fiche datée dans Notes
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR");
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const created = [];
    if (profile.location) created.push(`• Location: ${profile.location}`);
    if (profile.company)  created.push(`• Entreprise: ${profile.company}`);
    if (profile.companyUrl) created.push(`• Entreprise profile URL: ${profile.companyUrl}`);
    if (email)            created.push(`• Email: ${email}`);
    if (phone)            created.push(`• Téléphone: ${phone}`);
    let creationEntry = `📅 ${dateStr} ${timeStr} — CRÉATION DE LA FICHE`;
    if (created.length) creationEntry += " :\n" + created.join("\n");
    fields["Notes"] = creationEntry;

    const createdRec = await airtableRequest(token, "POST", `/${baseId}/${tableId}`, { fields });
    recordId = createdRec.id;
  }

  // 4b. Photo de profil en base64 (téléchargée dans le contexte LinkedIn, uploadée
  //     comme pièce jointe — fiable, contrairement au passage par [{url}]).
  if (profile.photoUrl && tabId) {
    try {
      const photoB64 = await getPhotoBase64(tabId, profile.photoUrl);
      if (photoB64) {
        // Vide d'abord le champ pour éviter le cumul de pièces jointes
        await airtableRequest(token, "PATCH", `/${baseId}/${tableId}`,
          { records: [{ id: recordId, fields: { "Photo Profile": [] } }] });
        await uploadAttachment(token, baseId, tableId, recordId, "Photo Profile", "photo.jpg", photoB64);
        details.photo = true;
      } else {
        details.photoError = "téléchargement base64 échoué";
      }
    } catch (e) {
      details.photoError = e.message;
      console.warn("[LinkedIn→Airtable] Upload photo:", e.message);
    }
  }

  // 5. PDF natif LinkedIn
  const pdfName = (profile.fullName || "profil").replace(/[^a-zA-Z0-9 _\-]/g, "").trim() + ".pdf";
  let pdfDataUrl = null;

  if (tabId) {
    try {
      const b64 = await getNativePDF(tabId);
      if (b64?.includes("base64,")) {
        pdfDataUrl = b64;
        details.pdfSource = "natif LinkedIn ✓";
        details.pdf = true;
      }
    } catch (e) {
      console.warn("[LinkedIn→Airtable] PDF natif:", e.message, "→ fallback");
      details.pdfError = e.message;
    }
  }

  // Fallback : PDF généré (incluant coordonnées complètes)
  if (!pdfDataUrl) {
    try {
      const txt = generateProfilePDF({ ...profile, email, phone, website, connectedDate });
      pdfDataUrl = `data:application/pdf;base64,${btoa(txt)}`;
      details.pdfSource = "généré localement";
      details.pdf = true;
    } catch (e) {
      console.error("[LinkedIn→Airtable] PDF fallback:", e.message);
    }
  }

  if (pdfDataUrl) {
    try {
      await uploadAttachment(token, baseId, tableId, recordId, "Profile PDF", pdfName, pdfDataUrl);
    } catch (e) {
      details.pdf = false;
      details.pdfError = e.message;
      console.error("[LinkedIn→Airtable] Upload PDF:", e.message);
    }
  }

  return { id: recordId, details };
}

// ════════════════════════════════════════════════════════════════════════════
// ║                      MODE BATCH — Enrichir la base                        ║
// ║  Parcourt les contacts Airtable un par un, ouvre chaque profil LinkedIn,  ║
// ║  scrape tout (texte, photo, coordonnées, PDF, résumé IA), met à jour la   ║
// ║  fiche et historise les changements dans le champ Notes.                  ║
// ════════════════════════════════════════════════════════════════════════════

// État global du batch (en mémoire du service worker)
const batchState = {
  running: false,
  stopRequested: false,
  current: 0,
  total: 0,
  ok: 0,
  failed: 0,
  currentName: "",
  lastError: "",
  logs: [],           // historique des lignes affichées dans l'UI
};

// ─── Keep-alive : empêche le service worker MV3 de s'endormir pendant les pauses
let keepAliveTimer = null;
function startKeepAlive() {
  if (keepAliveTimer) return;
  // Un appel API Chrome toutes les 20s réinitialise le minuteur de mise en veille (30s)
  keepAliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000);
}
function stopKeepAlive() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}

// ─── Communication vers l'UI (popup) ─────────────────────────────────────────
function batchLog(line) {
  const stamp = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const entry = `${stamp}  ${line}`;
  batchState.logs.push(entry);
  if (batchState.logs.length > 200) batchState.logs.shift();
  console.log("[Batch]", line);
  notifyBatch();
}
function notifyBatch() {
  // L'UI peut être fermée → on ignore l'erreur "Receiving end does not exist"
  chrome.runtime.sendMessage({
    action: "batchProgress",
    state: {
      running: batchState.running,
      current: batchState.current,
      total: batchState.total,
      ok: batchState.ok,
      failed: batchState.failed,
      currentName: batchState.currentName,
      logs: batchState.logs.slice(-12), // les 12 dernières lignes
    },
  }).catch(() => {});
}

// ─── Récupération de la file Airtable à enrichir ──────────────────────────────
// Critère : contact AVEC une URL LinkedIn MAIS SANS PDF (= jamais enrichi proprement).
async function fetchBatchQueue(token, baseId, tableId, maxCount) {
  const formula = "AND({LinkedIn URL} != '', {Profile PDF} = '', OR({Statut Prospection} = 'À appeler', {Statut Prospection} = 'À relancer'))";
  const records = [];
  let offset = null;

  do {
    let path = `/${baseId}/${tableId}?filterByFormula=${encodeURIComponent(formula)}&pageSize=100`;
    // On ne ramène que les champs utiles au delta (allège la réponse)
    ["Profile Name", "LinkedIn URL", "Location", "Company Name", "Email", "Téléphone",
     "Notes", "Confirmed as Prospect", "Confirmed as Resource"]
      .forEach(f => { path += `&fields[]=${encodeURIComponent(f)}`; });
    if (offset) path += `&offset=${offset}`;

    const res = await airtableRequest(token, "GET", path);
    records.push(...(res.records || []));
    offset = res.offset || null;
  } while (offset && records.length < maxCount);

  return records.slice(0, maxCount);
}

// ─── Construction du delta historisé pour le champ Notes ──────────────────────
// Compare l'ancienne valeur Airtable et la nouvelle valeur scrapée.
// N'écrit une ligne QUE si la nouvelle valeur existe ET diffère de l'ancienne.
// Construit UNE entrée d'historique complète (en-tête date + liste des changements).
// Centralisé ici pour que le flux manuel ET le batch produisent le même format.
function buildHistoryEntry(oldFields, fresh) {
  const now = new Date();
  const date = now.toLocaleDateString("fr-FR");
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  // [label Airtable, valeur fraîche scrapée]
  const tracked = [
    ["Location",              fresh.location],
    ["Company Name",          fresh.company],
    ["Entreprise profile URL", fresh.companyUrl],
    ["Email",                 fresh.email],
    ["Téléphone",             fresh.phone],
  ];

  const lines = [];
  for (const [field, freshVal] of tracked) {
    const oldVal = (oldFields[field] || "").toString().trim();
    const newVal = (freshVal || "").toString().trim();
    if (newVal && newVal !== oldVal) {
      lines.push(`• ${field}: ${oldVal || "vide"} → ${newVal}`);
    }
  }

  let entry = `📅 ${date} ${time} — ENRICHISSEMENT EFFECTUÉ`;
  if (lines.length > 0) {
    entry += " :\n" + lines.join("\n");
  } else {
    entry += " (aucun changement détecté)";
  }
  return { entry, changeCount: lines.length };
}

// ─── Scraping complet d'un profil dans un onglet caché ────────────────────────
// Ouvre l'URL, attend le rendu, demande le scrape au content script, récupère
// les coordonnées (email/tel/site) puis le PDF natif. Ferme l'onglet à la fin.
async function enrichProfileInTab(linkedinUrl) {
  // Normalise le sous-domaine pays (fr./dz./hk./be./ca…) vers www. : le content
  // script n'est garanti que sur www.linkedin.com, et www sert le profil authentifié complet.
  const profileUrl = linkedinUrl.replace(/\/$/, "").split("?")[0]
    .replace(/^(https?:\/\/)[a-z]{2,3}\.linkedin\.com/i, "$1www.linkedin.com") + "/";
  const tab = await chrome.tabs.create({ url: profileUrl, active: false });
  const result = { profile: null, pdfDataUrl: null, pdfSource: "", photoB64: null };

  function waitTabComplete(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Tab load timeout")), timeoutMs);
      function onUpdate(id, info) {
        if (id === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          clearTimeout(timer);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdate);
    });
  }

  // Envoie un message au content script avec quelques tentatives (il peut ne pas
  // être prêt juste après "complete")
  // AMÉLIORÉ : 10 retries × 1.5s = jusqu'à 15s (LinkedIn en onglet caché peut être lent)
  function askScrape(retries = 10) {
    return new Promise((resolve) => {
      const attempt = (n) => {
        chrome.tabs.sendMessage(tab.id, { action: "scrapeProfile" }, (resp) => {
          if (chrome.runtime.lastError || !resp) {
            if (n > 0) return setTimeout(() => attempt(n - 1), 1500);
            return resolve(null);
          }
          resolve(resp.success ? resp.data : null);
        });
      };
      attempt(retries);
    });
  }

  try {
    await waitTabComplete(25000); // augmente timeout onglet à 25s
    await new Promise(r => setTimeout(r, 4000)); // augmente pause React à 4s

    // 1. Scrape principal (nom, poste, entreprise, localisation, photo, résumé)
    const profile = await askScrape();
    if (!profile) throw new Error("Scrape impossible (content script muet)");
    profile.linkedinUrl = profileUrl.replace(/\/$/, "");

    // 2. Coordonnées : clic "Coordonnées" → email / téléphone / site web
    const clicked = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const link = Array.from(document.querySelectorAll("a"))
          .find(a => /^(Coordonnées|Contact info)$/i.test((a.innerText || "").trim()));
        if (link) { link.click(); return true; }
        return false;
      },
    });
    if (clicked[0]?.result) {
      await new Promise(r => setTimeout(r, 2500));
      const contact = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const modal = document.querySelector('[role="dialog"], .artdeco-modal') || document;
          const emailA = modal.querySelector('a[href^="mailto:"]');
          const email = emailA?.href?.replace("mailto:", "").trim() || "";
          let phone = "", website = "";
          modal.querySelectorAll("section, li, div").forEach(sec => {
            const t = (sec.innerText || "").trim();
            if (!website && /^(Site web|Website|Site internet)/i.test(t)) {
              const m = t.match(/https?:\/\/[^\s)]+/);
              if (m && !/linkedin\.com/i.test(m[0])) website = m[0];
            }
            if (!phone && /^(Téléphone|Phone|Mobile|Portable|Tél)/i.test(t)) {
              const m = t.match(/[\+\d][\d\s\-\.\(\)]{6,20}/);
              if (m) phone = m[0].trim();
            }
          });
          if (!phone) {
            const phoneA = modal.querySelector('a[href^="tel:"]');
            if (phoneA) phone = phoneA.href.replace("tel:", "").trim();
          }
          // Ferme le panneau pour ne pas gêner la capture PDF
          (modal.querySelector('button[aria-label*="Fermer"], button[aria-label*="Dismiss"]'))?.click();
          return { email, phone, website };
        },
      });
      if (contact[0]?.result) {
        profile.email   = contact[0].result.email   || "";
        profile.phone   = contact[0].result.phone   || "";
        profile.website = contact[0].result.website || "";
        // Conversion de la date de connexion brute (FR) en ISO pour Airtable
        if (contact[0].result.connectedRaw) {
          profile.connectedDate = parseConnectedDate(contact[0].result.connectedRaw);
        }
      }
    }

    // 3. Photo de profil en base64 (avant le PDF, tant que la page est intacte)
    if (profile.photoUrl) {
      try {
        result.photoB64 = await getPhotoBase64(tab.id, profile.photoUrl);
      } catch (e) {
        console.warn("[Batch] Photo base64 échouée:", e.message);
      }
    }

    // 4. PDF natif LinkedIn (réutilise la mécanique éprouvée world:"MAIN")
    await new Promise(r => setTimeout(r, 1000));
    try {
      const b64 = await getNativePDF(tab.id, 25000);
      if (b64?.includes("base64,")) {
        result.pdfDataUrl = b64;
        result.pdfSource = "natif LinkedIn ✓";
      }
    } catch (e) {
      console.warn("[Batch] PDF natif échoué:", e.message);
    }

    result.profile = profile;
    return result;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ─── Enrichissement d'UN enregistrement Airtable existant ─────────────────────
async function enrichOneRecord(record, config) {
  const { token, baseId, tableId, geminiKey } = config;
  const old = record.fields || {};
  const linkedinUrl = old["LinkedIn URL"];

  // 1. Scrape + coordonnées + photo + PDF
  const { profile, pdfDataUrl, pdfSource, photoB64 } = await enrichProfileInTab(linkedinUrl);
  if (!profile) throw new Error("Profil non scrapé");

  // Nettoyage téléphone : chiffres uniquement
  const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, "");
  profile.phone = cleanPhone;

  // 2. Résumé IA (selon les checkboxes déjà cochées sur la fiche)
  const classifications = {
    prospect: !!old["Confirmed as Prospect"],
    resource: !!old["Confirmed as Resource"],
  };
  let profileSummary = profile.summary || "";
  if (geminiKey) {
    try {
      profileSummary = await generateGeminiSummary(geminiKey, profile, [], classifications);
    } catch (e) {
      console.warn("[Batch] Gemini échoué:", e.message);
    }
  }

  // 3. Entrée d'historique datée (AVANT d'écraser les champs)
  const { entry: histEntry } = buildHistoryEntry(old, {
    location: profile.location, company: profile.company,
    companyUrl: profile.companyUrl, email: profile.email, phone: cleanPhone,
  });

  // 4. Champs à mettre à jour (on n'écrit que ce qui a une valeur fraîche)
  // PROTECTION : Email + Téléphone ne sont jamais écrasés, seulement remplis si vides
  const fields = {};
  if (profile.fullName)  fields["Profile Name"]    = profile.fullName;
  if (profile.firstName) fields["Prénom"]          = profile.firstName;
  if (profile.lastName)  fields["Nom"]             = profile.lastName;
  if (profile.position)  fields["Poste"]           = profile.position;
  if (profile.company)    fields["Company Name"]            = profile.company;
  if (profile.companyUrl) fields["Entreprise profile URL"] = profile.companyUrl;
  if (profile.location)  fields["Location"]        = profile.location;
  if (profile.email && !old["Email"])     fields["Email"]           = profile.email;
  if (cleanPhone && !old["Téléphone"])    fields["Téléphone"]       = cleanPhone;
  if (profile.website)   fields["Site web"]        = profile.website;
  if (profile.connectedDate) fields["Connecté le"] = profile.connectedDate;
  if (profileSummary)    fields["Profile Summary"] = profileSummary;
  // NB : la photo n'est PAS passée en [{url}] (Airtable échoue à récupérer l'URL CDN
  //      signée) → upload base64 plus bas, comme le PDF.

  // Historisation : une seule entrée datée en tête du champ Notes
  const prevNotes = (old["Notes"] || "").toString();
  fields["Notes"] = prevNotes ? `${histEntry}\n\n${"─".repeat(30)}\n\n${prevNotes}` : histEntry;

  // 5. PATCH de la fiche
  await airtableRequest(token, "PATCH", `/${baseId}/${tableId}`,
    { records: [{ id: record.id, fields }] });

  // 5b. Photo de profil en base64 (upload fiable comme pièce jointe)
  if (photoB64) {
    try {
      await airtableRequest(token, "PATCH", `/${baseId}/${tableId}`,
        { records: [{ id: record.id, fields: { "Photo Profile": [] } }] });
      await uploadAttachment(token, baseId, tableId, record.id, "Photo Profile", "photo.jpg", photoB64);
    } catch (e) {
      console.warn("[Batch] Upload photo échoué:", e.message);
    }
  }

  // 6. PDF (remplace l'éventuel ancien)
  let pdf = pdfDataUrl;
  let src = pdfSource;
  if (!pdf) {
    try {
      // Le PDF fallback utilise les MEILLEURES données connues : scrape frais en
      // priorité, sinon la valeur déjà présente dans la fiche Airtable (`old`).
      // Évite un PDF quasi vide quand le scrape de ce run est partiel.
      const pdfProfile = {
        fullName:      profile.fullName  || old["Profile Name"] || "",
        firstName:     profile.firstName || old["Prénom"]       || "",
        lastName:      profile.lastName  || old["Nom"]          || "",
        position:      profile.position  || old["Poste"]        || "",
        company:       profile.company   || old["Company Name"] || "",
        location:      profile.location  || old["Location"]     || "",
        linkedinUrl:   linkedinUrl,
        email:         profile.email     || old["Email"]        || "",
        phone:         cleanPhone        || old["Téléphone"]    || "",
        website:       profile.website   || old["Site web"]     || "",
        connectedDate: profile.connectedDate || old["Connecté le"] || "",
        summary:       profileSummary    || old["Profile Summary"] || "",
        experiences:   profile.experiences || [],
        education:     profile.education   || [],
        rawText:       profile.rawText    || "",
      };
      const txt = generateProfilePDF(pdfProfile);
      pdf = `data:application/pdf;base64,${btoa(txt)}`;
      src = "généré localement";
    } catch (e) { /* PDF facultatif */ }
  }
  if (pdf) {
    const pdfName = (profile.fullName || "profil").replace(/[^a-zA-Z0-9 _\-]/g, "").trim() + ".pdf";
    try {
      // Vide d'abord le champ pour éviter le cumul de pièces jointes
      await airtableRequest(token, "PATCH", `/${baseId}/${tableId}`,
        { records: [{ id: record.id, fields: { "Profile PDF": [] } }] });
      await uploadAttachment(token, baseId, tableId, record.id, "Profile PDF", pdfName, pdf);
    } catch (e) {
      console.warn("[Batch] Upload PDF échoué:", e.message);
    }
  }

  return {
    name: profile.fullName || old["Profile Name"] || "?",
    histEntry, pdfSource: src,
    expCount: (profile.experiences || []).length,
    eduCount: (profile.education || []).length,
    sumLen:   (profileSummary || "").length,
    rawLen:   (profile.rawText || "").length,
  };
}

// ─── Boucle principale du batch ───────────────────────────────────────────────
async function runBatch(config) {
  if (batchState.running) return; // déjà en cours

  Object.assign(batchState, {
    running: true, stopRequested: false, current: 0, total: 0,
    ok: 0, failed: 0, currentName: "", lastError: "", logs: [],
  });
  startKeepAlive();

  const delayMs = Math.max(10, config.batchDelay || 45) * 1000;
  const maxCount = Math.min(200, Math.max(1, config.maxCount || 50));

  try {
    batchLog(`🔎 Recherche des contacts à enrichir (max ${maxCount})…`);
    const queue = await fetchBatchQueue(config.token, config.baseId, config.tableId, maxCount);
    batchState.total = queue.length;

    if (queue.length === 0) {
      batchLog("✅ Aucun contact à enrichir (tous ont déjà un PDF).");
      return;
    }
    batchLog(`📋 ${queue.length} contact(s) à traiter. Pause de ${delayMs / 1000}s entre chacun.`);

    for (let i = 0; i < queue.length; i++) {
      if (batchState.stopRequested) { batchLog("⏹️ Arrêt demandé par l'utilisateur."); break; }

      const record = queue[i];
      batchState.current = i + 1;
      batchState.currentName = record.fields["Profile Name"] || record.fields["LinkedIn URL"] || "?";
      batchLog(`(${i + 1}/${queue.length}) 🔗 Scraping : ${batchState.currentName}…`);

      try {
        const r = await enrichOneRecord(record, config);
        batchState.ok++;
        const changes = r.histEntry ? r.histEntry.split("\n").filter(l => l.startsWith("•")).length : 0;
        batchLog(`(${i + 1}/${queue.length}) ✅ ${r.name} — ${changes} chp, PDF: ${r.pdfSource || "non"} | page: ${r.rawLen}c scrapés, ${r.expCount} exp, résumé ${r.sumLen}c`);
      } catch (e) {
        batchState.failed++;
        batchState.lastError = e.message;
        batchLog(`(${i + 1}/${queue.length}) ❌ ${batchState.currentName} — ${e.message}`);
      }

      // Pause anti-bannissement (sauf après le dernier)
      if (i < queue.length - 1 && !batchState.stopRequested) {
        batchLog(`⏳ Pause ${delayMs / 1000}s avant le suivant…`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    batchLog(`🏁 Terminé : ${batchState.ok} réussi(s), ${batchState.failed} échec(s).`);
  } catch (e) {
    batchLog(`💥 Erreur fatale : ${e.message}`);
  } finally {
    batchState.running = false;
    batchState.currentName = "";
    stopKeepAlive();
    notifyBatch();
  }
}

// ─── Messages UI → batch ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startBatch") {
    runBatch(request.config); // ne pas await : on répond tout de suite
    sendResponse({ success: true, started: !batchState.running ? true : true });
    return false;
  }
  if (request.action === "stopBatch") {
    batchState.stopRequested = true;
    sendResponse({ success: true });
    return false;
  }
  if (request.action === "getBatchStatus") {
    sendResponse({
      running: batchState.running,
      current: batchState.current,
      total: batchState.total,
      ok: batchState.ok,
      failed: batchState.failed,
      currentName: batchState.currentName,
      logs: batchState.logs.slice(-12),
    });
    return false;
  }
});
