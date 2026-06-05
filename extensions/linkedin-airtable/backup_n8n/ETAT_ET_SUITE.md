# État du chantier Airtable ↔ n8n — reprise

_MAJ : 2026-06-04. À lire en début de nouvelle session pour reprendre._

## Bases Airtable
- **LinkedIn Contact Management** `appiuwspImLMu7KJQ` (staging) — tables : Contacts LinkedIn `tblknsWOhLLtnTtIx`, Comptes Cibles `tbl2CiHhd4dLQRpHW`
- **CLIENTS** `appjbx1NZYVRvRqKR` — Companies `tblIG8xf2fmMPVksm`, Contacts `tbl1Qc2oJv8aiWhd5`
- **SOURCING** `appDeaz79kEZZmgKZ` — CANDIDATS `tblq91xsTKpbyuNXY`

## Modèle validé : 3 portes → 1 résolveur → Companies (référence unique)
- **A** : compte cible Adzuna (vit dans Comptes Cibles)
- **B** : employeur d'un contact LinkedIn (staging)
- **C** : employeur d'un contact déjà dans CLIENTS/Contacts
- Résolveur = matcher **SIREN → nom normalisé → slug LinkedIn**
- Prospect → lié à une fiche Companies. Ressource → employeur en texte (SOURCING/CANDIDATS).
- Employeur inconnu → **incuber via Comptes Cibles** (choix validé).

## Workflows n8n (instance https://usine.dinaou.com, clé dans ~/.n8n_api_key)
| Workflow | id | État |
|----------|-----|------|
| Moteur Adzuna → Cibles (02h) | XcKZyOGhVfqEtd5O | 🟢 actif |
| Qualif ESN/Client (03h, lot 30) | GmJnDUTIAdv5eCIQ | 🟢 actif |
| Enrichissement LinkedIn (04h) | AlrmjXJb3OxUYfCA | 🟢 actif |
| PUSH Cibles → Companies (05h) | MxSPqRuyxfSeHsPF | 🟢 actif |
| DRY-RUN rapprochement | LNovkOC1mFqNqL6P | manuel |
| AUDIT Porte C | pWVSPuSket8Q6F6Q | manuel |
| DRY-RUN liens C1 | 77qJROlpJy71gHgS | manuel |
| PUSH liens C1 | ev73nDFPz9QnahB3 | manuel (exécuté ✅) |

Scripts helper : dossier `backup_n8n/` (deploy_*.js, read_*.js via Node, UTF-8 propre). Déploiement = POST/PUT `/api/v1/workflows`. Lire exécution = `read_*.js`.

## Champs créés
- Comptes Cibles : **Qualif IA** `fldzn20tXbCPwxObL` (Client final/ESN/Recrutement/Intérim/Autre)
- Companies : **SIREN** `fldAOB47bTTqz0nIj`

## ✅ Fait
- **Phase 1** : pipeline nocturne complet (Adzuna→qualif→LinkedIn→push). Companies 61→113 (52 créées + 2 complétées). Anti-écrasement validé.
- **Porte C1** : 36 contacts existants reliés à leur société (champ `Entreprise`). Vérifié.

## 🔜 Suite (par ordre)
1. **Porte C2** — 62 contacts (57 employeurs distincts) sans société dans Companies.
   - PROCHAINE ACTION : construire un **dry-run d'incubation C2** = liste nettoyée des employeurs à injecter dans Comptes Cibles (filtrer déchets : « Entreprise », « Freelance DevOps », slugs ; les ESN type Capgemini/CGI/Datadog seront écartés par la qualif, pas promus).
   - Puis : injecter dans Cibles → qualif/SIREN/LinkedIn la nuit → promus si Client final → **rejouer le PUSH liens C1** (ev73nDFPz9QnahB3) pour relier les contacts.
2. **Porte B** — migration des Contacts LinkedIn (staging) → Prospect (CLIENTS/Contacts, lié société) / Ressource (SOURCING/CANDIDATS, texte).
   - Déclencheur : cases `Confirmed as Prospect/Resource` + **suggestion Google Chat (Shodo Reports)** quand contact assez enrichi → l'utilisateur choisit → action.
3. **Nettoyage dette** : fusionner les 2 liens société de CLIENTS/Contacts (`Entreprise` + `Companies 2`) en un seul ; champs `Field 15`, `Field 34`.

## Audit Porte C (chiffres)
380 contacts : 133 liés, 247 sans lien (149 sans employeur, 36 C1 faits, 62 C2 à incuber).

## Doc
- `graphify-out/GRAPH_REPORT.md` : section « Architecture Airtable » + flux (à jour, flux #4 = fait).

---

## MAJ 2026-06-04 (soir) — Porte C2 en cours

**Leçon technique importante** : les workflows qui lisent PLUSIEURS tables Airtable en série multipliaient les items (n8n exécute un nœud 1×/item d'entrée → 380 contacts × 113 companies = 42 940 → 504). **FIX = `"executeOnce": true`** sur les nœuds de lecture en aval (+ `retryOnFail/maxTries/waitBetweenTries` contre les 504 transitoires). À mettre sur TOUT workflow multi-lectures (audit, dry-run C1/C2 anciens en souffrent aussi mais tolèrent).

**Nouveaux workflows :**
| Workflow | id | État |
|----------|-----|------|
| DRY-RUN incubation C2 | x29R1Wkv2fm9AjZ5 | manuel (OK, executeOnce+retry) |
| PUSH incubation C2 | jWm9cHPFc6Y8mTde | manuel — **À EXÉCUTER** |

**Dry-run C2** : 57 employeurs distincts → 52 à incuber, 4 déchets écartés, 1 doublon. Filtre déchets : « entreprise/independant/etudiant/autoentrepreneur » + regex freelance/jardin/portee mondial.

**PROCHAINES ACTIONS dans l'ordre :**
1. Exécuter **PUSH incubation C2** (jWm9cHPFc6Y8mTde) → crée ~51 cibles (Notes = « Incube depuis CLIENTS/Contacts (Porte C2) »).
2. Laisser tourner les nuits (qualif 03h ESN/client + LinkedIn 04h + push Companies 05h) → les vrais clients montent dans Companies.
3. **Re-exécuter PUSH liens C1** (ev73nDFPz9QnahB3) → relie les contacts dont l'employeur vient d'arriver dans Companies. (Le linker C1 = le « boucleur » récurrent ; à terme le passer en nocturne.)
4. Puis **Porte B** (migration Contacts LinkedIn staging + suggestion Google Chat) et **nettoyage dette** (fusion liens `Entreprise`/`Companies 2`).

**Garde-fou** : rien n'entre dans Companies sans `Qualif IA = Client final` → AUTOENTREPRENEUR/ESN/déchets incubés restent bloqués en Cibles, ne polluent jamais le CRM.

---

## MAJ 2026-06-05 — Enrichissement URLs LinkedIn (prospection)

**Objectif** : préparer la prospection (comptes Rennes/Nantes). Cible = contacts **CLIENTS/Contacts** au statut `Statut Prospection` ∈ {À appeler, À relancer} = **241 contacts**.

**TOUT se passe dans UNE seule table** : base **CLIENTS** `appjbx1NZYVRvRqKR` → table **Contacts** `tbl1Qc2oJv8aiWhd5`. Rien dans LinkedIn Contact Management, rien en staging.

**Diagnostic complétude des 241** (script `analyze_contacts.js`) :
- `LinkedIn URL` vide : **63 / 241**
- Email vide : 67% · Téléphone vide : 75% · `Profile PDF` (CV) vide : **100%** · `Profile Summary` vide : 100%

**2 champs créés dans CLIENTS/Contacts :**
| Champ | id | Type | Rôle |
|-------|-----|------|------|
| `LinkedIn URL (proposé)` | fldix7BSEG4T3Z3iP | url | brouillon/staging des URLs trouvées |
| `Confiance URL` | fldktaxGfvS7Itnpk | singleSelect (Haute/Moyenne/Faible) | niveau de confiance |

Champ live existant utilisé : `LinkedIn URL` = **fldvNRj7MBoTWmSLx**.

**Méthode de recherche d'URL — comparatif testé :**
| Méthode | Recall | Verdict |
|---------|--------|---------|
| Gemini 2.5 Flash + google_search grounding | ~5% (1/20) | ❌ n'émet pas les slugs `/in/` |
| DuckDuckGo scrape serveur | 0% | ❌ bloqué (HTTP 202 anti-bot) |
| Claude-for-Chrome (X-Ray navigateur) | — | ❌ bloqué : « Grouping not supported » (tab groups désactivés par policy entreprise) |
| **WebSearch (agent) + désambiguïsation manuelle** | **60% (38/63)** | ✅ **méthode retenue** |

⚠️ **IMPORTANT** : la recherche d'URL a été faite **par l'agent (moi) à la main** via l'outil WebSearch, **PAS** par un workflow n8n autonome. Pour refaire une passe → redemander à l'agent. Le workflow n8n « Trouveur URL LinkedIn (Gemini, manuel) » (id **nrMgGBY3mXsyL5Cp**) est **archivé/abandonné** (Gemini insuffisant).

**Résultat des 63 traités** : 29 Haute · 9 Moyenne · 25 Faible.
**Promotion** (sur validation user) : les **38** (Haute+Moyenne) recopiés du champ `proposé` → champ live `LinkedIn URL`. Le champ `proposé` + `Confiance URL` restent comme **trace d'audit**.
→ Contacts avec URL : **178 → 216 / 241**.

**Intel collectée pendant la passe** (à reporter dans la base) :
- **CATS** = Crédit Agricole Technologies et Services
- **Cityzen (Apo)** → plusieurs personnes désormais chez **Arche MC2** (rebrand/rachat probable)
- Prénoms/noms corrigés : Céline (≠Cécile) Danilo, Erwan Pigneul, Jérémy Lefrère, Erwan de Malézieu, Michel Le Nouy…

**RESTE À FAIRE :**
1. **25 contacts Faible** = noms mal saisis (`GALL LE`, `BROCHADO`, `KURZ`, `Malézieu De`, `B FAUCHOUX`, `DENIS`, `Pigneul` sans prénom…) → corriger les noms dans la base, puis redemander une passe X-Ray.
2. **Vérifier les 9 Moyenne** (tri `Confiance URL` = Moyenne) : Pouliquen, Secher, Gaborieau, Sicre, Gaidier, Trécherel, Desmarest, Cailley, Guillemot (souvent : bon profil mais entreprise actuelle ≠ celle de la base).
3. **GROS CHANTIER — Scraping CV + coordonnées** des ~216 contacts qui ont une URL (email 67% vide, tél 75% vide, CV 100% vide). Méthode à trancher : **extension Chrome** (manuel, gratuit, sûr) vs **API payante** (ProxyCurl/Apify, auto). ⚠️ n8n ne peut PAS reproduire le scraping (mur login LinkedIn + PDF natif = navigateur connecté uniquement).

**Scripts créés** : `analyze_contacts.js`, `extract_todo63.js` (→ `todo63.json`), `test_gemini_url.js`, `test_ddg.js`, `inspect_gemini.js`, `urlfinder.json` + `deploy_urlfinder.js` (workflow abandonné), `read_urlfinder.js`.
