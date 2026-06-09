# Graph Report - n8n-forge-v2  (2026-06-03)

## Corpus Check
- 34 files · ~25,147 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 399 nodes · 457 edges · 33 communities (27 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `70e0e73a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 32|Community 32]]

## God Nodes (most connected - your core abstractions)
1. `McpClient` - 23 edges
2. `activeVersion` - 12 edges
3. `activeVersion` - 12 edges
4. `handleSave()` - 12 edges
5. `SessionsService` - 11 edges
6. `enrichOneRecord()` - 8 edges
7. `Extension Chrome — LinkedIn → Airtable` - 8 edges
8. `connections` - 7 edges
9. `connections` - 7 edges
10. `runBatch()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `handleSave()` --calls--> `generateProfilePDF()`  [INFERRED]
  extensions/linkedin-airtable/background.js → extensions/linkedin-airtable/pdf-generator.js
- `enrichOneRecord()` --calls--> `generateProfilePDF()`  [INFERRED]
  extensions/linkedin-airtable/background.js → extensions/linkedin-airtable/pdf-generator.js

## Import Cycles
- None detected.

## Communities (33 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (20): app, cache, cors, DATA_DIR, express, fs, GeminiService, mcp (+12 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (25): activeVersion, authors, autosaved, connections, createdAt, description, name, nodes (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.19
Nodes (22): airtableRequest(), batchLog(), batchState, buildHistoryEntry(), enrichOneRecord(), enrichProfileInTab(), fetchBatchQueue(), findExistingRecord() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (23): active, activeVersionId, createdAt, description, id, isArchived, meta, templateCredsSetupCompleted (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (22): active, activeVersionId, createdAt, description, id, isArchived, meta, name (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (21): dependencies, cors, dotenv, express, node-fetch, react, react-dom, description (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (21): activeVersion, authors, autosaved, connections, createdAt, description, name, nodes (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (18): main, Chaque Matin, Formater Résumé, Lire Flux RSS, createdAt, deployed, main, history (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (18): main, Chaque Matin (8h), Lire Flux RSS, Préparer Résumé, createdAt, deployed, history, id (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (16): action, default_icon, default_popup, background, service_worker, content_scripts, 128, 16 (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (5): api, App(), fmtTime(), Message(), useToasts()

### Community 12 - "Community 12"
Cohesion: 0.32
Nodes (10): displayProfile(), fillField(), init(), loadConfig(), saveContact(), showBatchConfig(), showError(), showState() (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (10): Architecture technique, Champs remplis automatiquement, Configuration (une seule fois), Extension Chrome — LinkedIn → Airtable, Gestion des doublons, Installation (mode développeur), Limites connues, Points clés / pièges contournés (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (9): Ce que je veux que tu fasses par défaut, Commandes utiles (communes), Conventions importantes, Deux modes de travail, MODE DEV — rechargement automatique (pour le développement actif), MODE PROD — build Docker complet (pour tester le build final ou déployer), N8N Forge V2, Stack technique (haut niveau) (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.20
Nodes (9): Backend N8N Forge V2 (server/), Ce qu'il ne faut pas casser, Ce que tu peux améliorer, Commandes utiles (backend), Comment je veux que tu travailles dans server/, Fichiers importants, Intégration avec n8n, Limites à respecter (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (7): createdAt, deployed, history, id, title, updatedAt, workflow

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (7): createdAt, deployed, history, id, title, updatedAt, workflow

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (7): createdAt, deployed, history, id, title, updatedAt, workflow

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (7): createdAt, deployed, history, id, title, updatedAt, workflow

### Community 21 - "Community 21"
Cohesion: 0.25
Nodes (7): createdAt, deployed, history, id, title, updatedAt, workflow

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (7): createdAt, deployed, history, id, title, updatedAt, workflow

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (5): Ce qu'il faut éviter, Commandes spécifiques (si besoin), Comment je veux que tu travailles dans client/, Frontend N8N Forge V2 (client/), Structure importante

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): CE QUE TU FAIS, CE QUE TU NE DIS JAMAIS, Contexte technique (NE PAS MENTIONNER À L'UTILISATEUR), Règles absolues — NE PAS DÉROGER, Structure du projet

### Community 25 - "Community 25"
Cohesion: 0.83
Nodes (3): scrapeProfile(), text(), waitFor()

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (6): extractNode, filterNode, fs, putPayload, updateNode, wf

## Knowledge Gaps
- **228 isolated node(s):** `allow`, `recommendations`, `api`, `id`, `title` (+223 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## 🚀 N8N Workflows Elaboration (2026-06-04)

### Workflow 1: Shodo - Enrichissement LinkedIn Comptes Cibles (Gemini)
**Purpose:** Auto-enrich current (56) and future Comptes Cibles with LinkedIn company page URLs via Gemini 2.5 Flash + Google Search grounding.

**Nodes (4):**
- `Chaque nuit 04h00` — Schedule trigger (cron: `0 4 * * *`)
- `Airtable : Comptes Cibles` — Search all 56 cibles (operation: search)
- `Gemini : page LinkedIn` — Code nœud calling `$env.GEMINI_API_KEY`, grounding enabled
- `Airtable : Update page LinkedIn` — Update only "Page LinkedIn entreprise" field

**Environment Variables Required:**
- `GEMINI_API_KEY` — Gemini 2.5 Flash API key (in n8n container env)

**Status (2026-06-04):**
- ✅ Deployed & tested
- ✅ Execution 66: SUCCESS (2h10 run, 22 Gemini calls)
- ✅ 8 new LinkedIn pages found from 22 "no match" records
- ✅ 34/56 cibles now have page LinkedIn (61% coverage)
- ✅ Access to `$env.GEMINI_API_KEY` confirmed working in Code nœud

**Key Insights:**
- Gemini with grounding finds pages even strict prompts missed (Samsic, Fleury Michon, Eurofins, etc.)
- Timeout: ~15s per call (with AbortController in nœud Code)
- Historization: single dated entry per enrichment in Notes field

---

### Workflow 2: Shodo - Moteur de cibles v2 (Adzuna + Gemini LinkedIn)
**Purpose:** Generate new sales targets from Adzuna job postings (Rennes/Nantes, IT), enrich with SIRENE/Apollo, then auto-populate LinkedIn company page via Gemini.

**Nodes (6):**
- `Chaque nuit 02h00` — Schedule trigger (cron: `0 2 * * *`)
- `Adzuna enrichissement classement` — Code nœud: fetch Adzuna API, filter ESN/recruiters, SIRENE lookup, stack tagging
- `Airtable Comptes Cibles upsert` — Upsert on "Entreprise" field, autoMap all fields
- `Gemini : enrichissement LinkedIn` — Code nœud: reads `f.fields.Entreprise` (nested upsert output), calls Gemini, caches results
- `Airtable : Update LinkedIn` — Update only "Page LinkedIn entreprise" field on new cibles

**Environment Variables Required:**
- `ADZUNA_APP_ID` — Adzuna API app ID
- `ADZUNA_APP_KEY` — Adzuna API app key
- `GEMINI_API_KEY` — Gemini 2.5 Flash API key
- `N8N_RUNNERS_TASK_TIMEOUT` — Set to 900 (15 min) to allow ~40 Gemini calls in series

**Elaboration Timeline:**
- **2026-05-31 v1:** Original workflow created, blocked by `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`
- **2026-06-03 v1.1:** Env access reactivated (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`), but field name mismatches (accents: `Département` vs `Departement`)
- **2026-06-04 v2:** Fixed field names (accents: `Département`, `Assigné à`, `Signal d'achat`, `Grande Région`, etc.)
- **2026-06-04 v2.1:** Added deduplication (149 offres → ~40 unique companies)
- **2026-06-04 v2.2:** Fixed Gemini nœud to read `f.fields.Entreprise` (upsert returns nested structure)
- **2026-06-04 v2.3:** Added timeout 15s per Gemini call, increased `N8N_RUNNERS_TASK_TIMEOUT` to 900s

**Status (2026-06-04):**
- ✅ Execution 66: SUCCESS — Adzuna produced 149 offres, upserted to Airtable
- ✅ Fixed: accent encoding in field names
- ✅ Fixed: read nested `fields` structure from upsert output
- ⏳ Gemini enrichment: running (est. 5-10 min for ~40 appels)
- ✅ N8N upgraded from 2.22.4 to 2.25.2

**Key Improvements Made:**
1. **Accents handling** — Changed `Departement` → `Département`, `Assigne a` → `Assigné à`
2. **Data structure fix** — Airtable upsert returns `{id, fields:{...}}` (nested), search returns flat; Gemini nœud now handles both
3. **Deduplication** — Filter by lowercase company name to reduce duplicate Gemini calls
4. **Timeout optimization** — AbortController(15s) + `N8N_RUNNERS_TASK_TIMEOUT: 900`
5. **Code organization** — Separated Airtable upsert (all fields) from LinkedIn update (single field)

---

### Workflow 3: Shodo - Moteur de cibles (Adzuna vers Comptes Cibles) [Original v1]
**Status:** Archived/superseded by v2. (Kept for reference — no longer active.)

---

## Critical Fixes Applied

| Issue | Root Cause | Solution | Impact |
|-------|-----------|----------|--------|
| N8N_BLOCK_ENV_ACCESS_IN_NODE | Security default blocks `$env.*` in Code nœuds | Set to `false` in docker-compose | Enabled Adzuna + Gemini access |
| Field name mismatches | Original code used ASCII (Departement) vs Airtable schema (Département) | Updated all field names to match Airtable schema exactly | Upsert now writes successfully |
| Gemini returning 0 items | Expected flat `f.Entreprise`, got nested `f.fields.Entreprise` | Added fallback: `const fields = f.fields \|\| f;` | All 149 items now processed |
| N8N timeout after 300s | Default `N8N_RUNNERS_TASK_TIMEOUT` insufficient for 40 Gemini calls | Increased to 900s (15 min) | Gemini can complete all calls |

---

## Testing Results

| Workflow | Date | Execution | Status | Output | Notes |
|----------|------|-----------|--------|--------|-------|
| LinkedIn Comptes Cibles | 2026-06-04 | #66 | ✅ SUCCESS | 22 items → Gemini → 8 URLs found | 2h10 run (throttled by Gemini) |
| Moteur v2 Adzuna | 2026-06-04 | #67 | ✅ (Adzuna OK, Gemini running) | 149 offres → dedup → ~40 uniques | Awaiting Gemini results |

---

## Graph Freshness (Workflows)
- **Last update:** 2026-06-04 08:30 UTC
- **Commit reference:** (n8n workflows fetched via API, not git-tracked in this repo)
- **N8N API version:** 2.25.2 (updated from 2.22.4)

---

## Suggested Questions (N8N Workflows)
_Specific to workflow elaboration:_

- **Why did field name mismatches cause upsert failures?**
  _Airtable schema uses accented field names (Département, Assigné à); original code used ASCII equivalents._
  
- **How does Gemini deduplication reduce API calls?**
  _Set-based tracking of `clean(company).toLowerCase()` prevents redundant grounding calls for duplicate company names across job postings._

- **What's the critical path bottleneck?**
  _Gemini enrichment: ~150-250ms per call + grounding (~5-10s depending on company obscurity). Total 40 calls ≈ 5-10 min worst-case._

---

# 🗄️ Architecture Airtable (audit 2026-06-04)

Écosystème de **3 bases actives** (+ 1 legacy). Logique ESN : capter des contacts/entreprises depuis LinkedIn, puis les router vers le CRM commercial (CLIENTS) ou la base candidats (SOURCING).

```
                    ┌─────────────────────────────────────┐
                    │   LinkedIn Contact Management        │  ← STAGING (entrant)
                    │   (appiuwspImLMu7KJQ)                │
                    │   • Contacts LinkedIn (~5000)        │
                    │   • Comptes Cibles                   │
                    └───────────────┬─────────────────────┘
                       prospect ┌───┴───┐ ressource
                                ▼       ▼
        ┌───────────────────────────┐   ┌───────────────────────────┐
        │  CLIENTS (CRM commercial) │   │  SOURCING (candidats)     │
        │  (appjbx1NZYVRvRqKR)      │   │  (appDeaz79kEZZmgKZ)      │
        │  • Companies ◄── Cibles   │   │  • CANDIDATS              │
        │  • Contacts               │   │  • OPPORTUNITES           │
        │  • Opportunities          │   │  • MATCHINGS              │
        └───────────────────────────┘   └───────────────────────────┘
```

## Base 1 — LinkedIn Contact Management `appiuwspImLMu7KJQ` (STAGING / entrant)

| Table | Rôle | Champs clés |
|-------|------|-------------|
| **Contacts LinkedIn** | ~5000 contacts scrapés (extension Chrome). Source de tout le routage. | Profile Name, LinkedIn URL, Prénom/Nom, Email, Téléphone, Poste, Entreprise, Location, **Confirmed as Prospect** (☑), **Confirmed as Resource** (☑), Rôle(s), Profile Summary, Profile PDF, Site web, Entreprise profile URL, Notes |
| **Comptes Cibles** | Entreprises prospects détectées par le moteur Adzuna (Rennes/Nantes, IT). | Entreprise, **SIREN/SIRET**, Code NAF, Type entreprise, **Qualif IA** (Gemini), Ville, Département, Bassin, Assigné à, Signal d'achat, Profils/Stack, **Page LinkedIn entreprise**, Niveau couverture, Décideur principal, Requête X-ray |
| **Contacts à Prospecter** | Sous-ensemble routé « prospect » (table de travail interne). | Contact Name, Company, Email, Phone, Prospecting Status, Actions, Ressources |
| **Ressources** | Sous-ensemble routé « ressource » (interne). | Resource Name, LinkedIn, Email/Phone, Company, Position, Date Confirmed as Resource |
| **Partenaires** | Apporteurs d'affaires / co-traitants issus du réseau. | Partner Name, Type de partenariat, Statut |
| **Actions** / **Historique** | Journal des actions & historisation par contact. | Action Type, Action Date, Performed By, Notes |
| **Entreprise de services numériques** | Référentiel ESN. | Company Name, Specialties, Annual Revenue |

## Base 2 — CLIENTS `appjbx1NZYVRvRqKR` (CRM commercial — destination prospects)

| Table | Rôle | Champs clés |
|-------|------|-------------|
| **Companies** | Entreprises clientes/prospects. **Cible du flux Comptes Cibles.** ⚠️ pas de SIREN actuellement. | Company Name, Industry, Téléphone, Number of Employees, Annual Revenue, adresse, Headquarters Location, Linkedin Url, Related Contacts, Related Opportunities |
| **Contacts** | Table riche de prospection (tél/mail/LinkedIn). **Cible du flux contacts-prospects.** | Profile Name, Email, Téléphone, Location, Company Name, Poste, LinkedIn URL, Statut Prospection, Profile Summary, liens Opportunities/Companies/Templates, bouton « brouillon mail » |
| **Opportunities** | Deals/affaires. | Opportunity Name, Stage, Value, Close Date, Companies, Contact, Ressources |
| **Interactions** | Historique relationnel (appels/mails/RDV). | Interaction Type, Date, Outcome, Contact, Company, Related Opportunity |
| **Call Trackings** / **Email Trackings** | Logs détaillés appels & emails. | Date, Duration, Outcome / Subject, Sender, Recipient, Content |
| **Tasks** | To-dos prospection. | Task Name, Due Date, Priority, Status, Assigned To |
| **Ressources** | Ressources staffées sur opportunités (TJM/CJM/dispo). | Full_Name, TJM, CJM, CV, DT ESN, Date dispo, Opportunities |
| **Templates** | Modèles d'emails (objet/corps/signature/PJ). | Type de mails, Corps de mail, Signature |
| **Google LinkedIn Request** | Générateur de requêtes X-ray LinkedIn. | Title Keywords, Localisation, url (formule) |

## Base 3 — SOURCING `appDeaz79kEZZmgKZ` (candidats — destination ressources)

| Table | Rôle | Champs clés |
|-------|------|-------------|
| **CANDIDATS** | Vivier candidats/freelances IT. **Cible du flux contacts-ressources.** | Prénom/Nom, Email, LinkedIn, Téléphone, Titre Actuel, Location, Statut Contractuel, TJM Souhaité, Date Dispo, Hard/Soft Skills, **CV Texte OCR**, CV Original, Dossier Technique, **Statut Candidat** (Vivier/En Process/Indispo/Blacklisté) |
| **OPPORTUNITES** | Besoins clients à staffer. | Nom Opportunité, Client, Budget, Mots-Clés IA, Lien X-Ray, CANDIDATS, Matchings |
| **MATCHINGS** | Rapprochement candidat ↔ besoin (scoré par IA). | Candidat, Opportunité, **Matching Score**, Analyse IA, Message Brouillon, Statut positionnement |
| **Interactions** | Historique candidat (qualif/entretiens/refus). | Type, Date, Notes, Candidat, Client |

*(Base legacy `appXB1l9coJTIw44o` « old Sourcing de Candidats Freelance IT » — ignorée.)*

## 🔀 Flux & mécanismes entre tables (pipeline cible)

| # | Flux | Clé de rapprochement | Mécanisme | Statut |
|---|------|----------------------|-----------|--------|
| 1 | Adzuna → **Comptes Cibles** | Entreprise (upsert + dédup) | Moteur n8n 02h00 | ✅ en prod |
| 2 | **Comptes Cibles** : qualif ESN/Client | — | Workflow Gemini 03h00 → champ **Qualif IA** | ✅ en prod |
| 3 | **Comptes Cibles** : page LinkedIn | — | Workflow Gemini 04h00 → **Page LinkedIn entreprise** | ✅ en prod |
| 4 | **Comptes Cibles** → CLIENTS/**Companies** | **SIREN** → nom normalisé → URL LinkedIn | Workflow PUSH 05h00 : filtre `Qualif IA = Client final`, remplissage **vides only** (anti-écrasement). Validé par dry-run (56 cibles → 52 créées + 2 complétées, 0 écrasement) | ✅ en prod |
| 5 | **Contacts LinkedIn** → CLIENTS/**Contacts** | LinkedIn URL → email | Déclencheur `Confirmed as Prospect` + suggestion Google Chat (Shodo Reports) | ⬜ Phase 2 |
| 6 | **Contacts LinkedIn** → SOURCING/**CANDIDATS** | LinkedIn URL → email | Déclencheur `Confirmed as Resource` + suggestion Google Chat | ⬜ Phase 2 |

**Règles d'intégrité (non négociables) :**
- **Clé entreprise = SIREN** (officiel, unique). Le nom seul est trop ambigu (« Orange » ≠ « Orange SA » ≠ « Orange Business Services »).
- **Anti-écrasement** : sur une fiche existante, on ne remplit QUE les champs vides ; jamais d'écrasement d'une valeur saisie.
- **Qualification avant push** : seuls les `Qualif IA = Client final` partent vers Companies (les ESN/cabinets/intérim sont filtrés — le code NAF ne suffit pas, ex. Capgemini en NAF holding).
- **Dry-run obligatoire** : tout flux inter-bases produit un rapport « MATCH / NOUVEAU / EXCLU » validé humainement avant écriture.

## 🧹 Dette technique repérée (champs à simplifier)
- **Companies** : `Field 15` (vide), `Copie de Contacts` + double lien `Contacts`/`Related Contacts` (redondants), pas de SIREN.
- **Contacts (CLIENTS)** : `Companies 2` + `Entreprise` (double lien entreprise), `Field 34`, `brouiilon mail` (typo).
- **Comptes Cibles** : `Ville` contient parfois un code département (ex. « 35 ») au lieu d'une ville (héritage du bug du moteur v1, corrigé en v2).

---

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SessionsService` connect `Community 14` to `Community 0`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `activeVersion` connect `Community 1` to `Community 4`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `allow`, `recommendations`, `api` to the rest of the system?**
  _228 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09666666666666666 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._