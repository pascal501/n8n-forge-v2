# Manuel utilisateur — LinkedIn Profiler → Airtable v2.0

## 1. Vue d'ensemble

L'extension Chrome **LinkedIn Profiler** scrape les profils et pages entreprise LinkedIn, structure les données via IA (Gemini Flash / DeepSeek), et les enregistre dans Airtable. Elle supporte deux modes :

- **Mode manuel** : cliquer sur le popup quand on est sur un profil/une page entreprise/le feed
- **Mode batch** : enrichir automatiquement de 1 à 300 contacts existants dans Airtable

L'extension cible **deux bases Airtable distinctes** :

| Base | Table Contacts | Table Entreprises | Table Offres |
|------|---------------|-------------------|--------------|
| **LinkedIn Contact Management** (LCM) | Contacts LinkedIn | Comptes Cibles | Offres emploi |
| **CLIENTS** | Contacts | Companies | *(pas de table offres)* |

Le sélecteur de cible dans le popup détermine dans quelle base les données sont écrites.

---

## 2. Installation

1. Ouvrir `chrome://extensions` dans Chrome
2. Activer le **mode développeur** (interrupteur en haut à droite)
3. Cliquer **"Charger l'extension non empaquetée"**
4. Sélectionner le dossier `extensions/linkedin-profiler/`
5. L'icône apparaît dans la barre d'outils Chrome

---

## 3. Configuration (page Options)

Clic droit sur l'icône → **Options**, ou depuis le popup quand la config est manquante.

### 3.1 Clés API

| Champ | Obligatoire | Description |
|-------|:-----------:|-------------|
| Token Airtable | **Oui** | Personal Access Token avec scopes `data.records:write` + `schema.bases:read`. Doit avoir accès aux deux bases. |
| Clé Gemini | Recommandé | Gemini 2.5 Flash (gratuit). Structuration IA primaire. |
| Clé OpenRouter | Optionnel | DeepSeek v4 Flash. Fallback automatique si Gemini échoue. |

### 3.2 Base LinkedIn Contact Management

| Champ | Description |
|-------|-------------|
| Base ID | `appiuwspImLMu7KJQ` |
| Table Contacts | ID de la table "Contacts LinkedIn" |
| Table Entreprises | ID de la table "Comptes Cibles" |
| Table Offres emploi | ID de la table "Offres emploi" |

### 3.3 Base CLIENTS

| Champ | Description |
|-------|-------------|
| Base ID | `appjbx1NZYVRvRqKR` |
| Table Contacts | ID de la table "Contacts" |
| Table Entreprises | ID de la table "Companies" |

### 3.4 Batch

| Champ | Défaut | Description |
|-------|--------|-------------|
| Délai entre profils | 45s | Pause entre chaque scraping. Min 10s pour éviter le bannissement LinkedIn. |
| Max profils par session | 50 | Sécurité. Max 300. Commencer par 5 pour tester. |

> **Règle :** il faut configurer au moins **une** base complète (Base ID + Table Contacts) pour que l'extension fonctionne.

---

## 4. Sélecteur de cible

En haut du popup, une barre à deux boutons permet de choisir la base active :

- **🔗 LinkedIn Contact Mgmt** (bleu) → écrit dans les tables LCM
- **👥 CLIENTS** (vert) → écrit dans les tables CLIENTS

Ce choix est **persistant** (sauvegardé entre les sessions). Tout ce que fait l'extension — import manuel, batch, vérification de doublons — utilise la cible sélectionnée.

**Exception :** les offres d'emploi capturées depuis le feed sont **toujours** écrites dans la base LCM (table Offres emploi), quelle que soit la cible active.

---

## 5. Mode manuel — Import de profil

### 5.1 Workflow

1. Naviguer sur un profil LinkedIn (`linkedin.com/in/…`)
2. Cliquer sur l'icône de l'extension
3. Vérifier la cible active (LCM ou CLIENTS)
4. Cliquer **📥 Importer**

L'extension exécute 4 étapes :

| Étape | Action |
|-------|--------|
| 1. Lecture | Le content script scrape le texte de la page (16 000 chars max), ouvre le panneau Coordonnées pour récupérer email/téléphone/site web, extrait la photo de profil |
| 2. IA + Airtable | Le LLM structure le texte en JSON (nom, prénom, poste, entreprise, expériences, formations…). Le background cherche un doublon par URL LinkedIn, puis crée ou met à jour la fiche. |
| 3. PDF | Le popup génère un PDF structuré (A4, sans dépendances) avec photo, coordonnées, expériences, formations |
| 4. Upload | Le PDF est uploadé dans le champ "Profile PDF" d'Airtable |

### 5.2 Ce qui est écrit

| Champ | LCM (Contacts LinkedIn) | CLIENTS (Contacts) |
|-------|------------------------|-------------------|
| Nom complet | `Profile Name` | `Profile Name` |
| Prénom / Nom | `Prénom` / `Nom` | `Prénom` / `Nom` |
| URL LinkedIn | `LinkedIn URL` | `LinkedIn URL` |
| Poste | `Poste` | `Poste` |
| Entreprise (texte) | **`Entreprise`** | **`Company Name`** |
| Localisation | `Location` | `Location` |
| Email | `Email` | `Email` |
| Téléphone | `Téléphone` | `Téléphone` |
| Site web | `Site web` | `Site web` |
| URL entreprise | `Entreprise profile URL` | `Entreprise profile URL` |
| Résumé IA | `Profile Summary` | `Profile Summary` |
| Historique | `Notes` | `Notes` |
| Photo | `Photo Profile` | `Photo Profile` |
| PDF | `Profile PDF` | `Profile PDF` |
| Date enrichissement | **`Enrichment Date`** | *(n'existe pas — ignoré)* |
| Complétion | `Completion` | `Completion` |
| Lien entreprise | **`Comptes Cibles`** → Comptes Cibles | **`Entreprise`** → Companies |

---

## 6. Protection des données

### 6.1 Anti-doublon

La **détection de doublon** repose sur l'**URL LinkedIn normalisée** :
- Les sous-domaines pays (`fr.linkedin.com`, `de.linkedin.com`…) sont convertis en `www.linkedin.com`
- Le slug est mis en minuscules
- Les paramètres d'URL sont supprimés
- Un trailing slash est ajouté

Avant chaque création, l'extension cherche un record existant avec la même URL normalisée. Si trouvé → **mise à jour** (PATCH). Sinon → **création** (POST).

> **Conséquence :** il est impossible de créer deux fiches pour le même profil LinkedIn dans la même table.

### 6.2 Anti-overwrite (Email et Téléphone)

**Règle critique :** si un contact a déjà un Email ou un Téléphone dans Airtable, l'extension **ne les écrase jamais**, même si le scraping LinkedIn trouve une valeur différente.

```
SI le scraping trouve un email
  ET que le champ Email dans Airtable est VIDE
    → on écrit l'email
  SINON
    → on ne touche pas au champ
```

Cela protège les coordonnées saisies manuellement ou obtenues par d'autres canaux.

> **Exception :** lors de la **création** d'une fiche (pas de doublon trouvé), l'email et le téléphone sont toujours écrits car le record est vide.

### 6.3 Historisation dans Notes

Chaque enrichissement ajoute une entrée **en tête** du champ Notes :

```
📅 07/06/2026 14:30 — ENRICHISSEMENT EFFECTUÉ :
• Location: vide → Rennes, France
• Entreprise: vide → Acme Corp
─────────────────────────────

(notes précédentes conservées en dessous)
```

Les notes existantes ne sont **jamais supprimées**, seulement poussées vers le bas.

### 6.4 Photo et PDF

Lors d'un ré-enrichissement, la photo et le PDF sont **remplacés** (le champ est vidé puis re-uploadé). C'est intentionnel : on veut la version la plus récente.

### 6.5 Liaison automatique contact → entreprise (Feature C)

Quand un profil est importé, l'extension cherche si l'entreprise actuelle du contact existe déjà dans la table Entreprises. Si oui, elle crée un lien :

- **LCM** : écrit dans le champ `Comptes Cibles` (linked record)
- **CLIENTS** : écrit dans le champ `Entreprise` (linked record vers Companies)

> **Attention :** cette liaison **remplace** le lien existant (s'il y en a un). Si vous avez manuellement lié un contact à une autre entreprise, le ré-enrichissement peut changer ce lien.

---

## 7. Mode manuel — Import d'entreprise

1. Naviguer sur une page entreprise LinkedIn (`linkedin.com/company/…`)
2. Cliquer l'extension → **📥 Importer**

### Ce qui est écrit

| Champ | LCM (Comptes Cibles) | CLIENTS (Companies) |
|-------|---------------------|-------------------|
| Nom | `Entreprise` | `Company Name` |
| URL LinkedIn | `Page LinkedIn entreprise` | `Linkedin Url` |
| Description | `Description` | `Description` |
| Secteur | `Secteur` | `Secteur` |
| Taille | `Taille` | `Taille` |
| Nb abonnés | `Nb abonnés` | `Nb abonnés` |
| Spécialités | `Spécialités` | `Spécialités` |
| Année création | `Année de création` | `Année de création` |
| Site web | `Site web` | `Site web` |
| Logo | `Logo` | `Company Logo` |
| Résumé | `Profile Summary` | `Profile Summary` |
| PDF | `Profile PDF` | `Profile PDF` |
| Notes | `Notes` | `Notes` |
| Enrichment Date | `Enrichment Date` | `Enrichment Date` |
| Completion | `Completion` | `Completion` |
| Statut prospection | `Statut prospection` | `Statut prospection` |
| Dernier contact | `Dernier contact` | `Dernier contact` |
| Date de relance | `Date de relance` | `Date de relance` |
| Contacts liés | `Contacts LinkedIn` | `Related Contacts` |

Les deux bases reçoivent désormais le même niveau d'enrichissement entreprise (description, secteur, taille, résumé IA, PDF, etc.).

### Liaison des contacts salariés

Lors de l'import d'une entreprise, l'extension cherche dans la table Contacts tous les contacts dont le champ entreprise correspond (recherche insensible à la casse). Les contacts trouvés sont automatiquement liés à la fiche entreprise.

---

## 8. Mode Feed — Capture de posts

1. Naviguer sur le fil LinkedIn (`linkedin.com/feed`)
2. Le content script détecte automatiquement les posts contenant des mots-clés de recrutement IT en Bretagne/Pays de Loire
3. Cliquer l'extension → le compteur de posts détectés s'affiche
4. Cliquer **📥 Capturer les posts**

Les posts sont analysés par le LLM et écrits dans la table **Offres emploi** de la base **LCM** (toujours, quelle que soit la cible active).

---

## 9. Mode batch

Le batch enrichit automatiquement les contacts **déjà présents** dans Airtable qui n'ont pas encore été enrichis.

### 9.1 Lancer un batch

1. Cliquer **🤖 Enrichir ma base** (visible depuis le popup, même hors LinkedIn)
2. Choisir le nombre de profils (grille 50/100/150/200/250/300 ou valeur personnalisée)
3. Cliquer **Démarrer** → une fenêtre de monitoring s'ouvre

### 9.2 Critère de sélection (file d'attente)

La formule de sélection dépend de la cible active :

| Cible | Critère | Logique |
|-------|---------|---------|
| **LCM** | `{LinkedIn URL} != '' AND {Enrichment Date} = ''` | Un contact est "à enrichir" s'il a une URL LinkedIn mais pas encore de date d'enrichissement |
| **CLIENTS** | `{LinkedIn URL} != '' AND {Profile Summary} = ''` | Un contact est "à enrichir" s'il a une URL LinkedIn mais pas encore de résumé IA |

> **Pourquoi deux critères différents ?** Le champ `Enrichment Date` n'existe pas dans la base CLIENTS. On utilise `Profile Summary` comme marqueur d'enrichissement à la place : ce champ est toujours rempli par le LLM lors de l'enrichissement.

### 9.3 Ce que fait le batch pour chaque contact

1. Ouvre un onglet en arrière-plan vers le profil LinkedIn
2. Attend le chargement complet (+ 4s de marge)
3. Injecte le content script → scrape le texte, les coordonnées, la photo
4. Ferme l'onglet
5. Envoie le texte au LLM → extraction structurée
6. Génère un résumé IA (Profile Summary)
7. Met à jour la fiche Airtable (mêmes règles anti-overwrite que le mode manuel)
8. Upload la photo de profil
9. Pause de N secondes (configurable) avant le contact suivant

### 9.4 Ce que le batch ne fait PAS

- **Pas de génération de PDF** : le PDFBuilder fonctionne dans le popup (DOM), pas dans le service worker. Le PDF ne sera généré que lors d'un ré-enrichissement manuel ultérieur.
- **Pas de capture de feed** : le batch ne traite que les contacts.

### 9.5 Monitoring

La fenêtre batch-monitor affiche en temps réel :
- Progression (N / total)
- Nom du contact en cours
- Logs de chaque opération (succès ✅ / échec ❌)
- Bouton **Stop** pour arrêter proprement

---

## 10. Features avancées

### Feature A — Détection de doublon dans le popup

Quand on ouvre le popup sur un profil LinkedIn, l'extension vérifie **immédiatement** si ce contact existe déjà dans la base active. Si oui, une bannière verte s'affiche avec :
- Le nom du contact
- La date du dernier enrichissement
- Un lien direct vers la fiche Airtable
- Un bouton "Mettre à jour" (au lieu de "Importer")

### Feature B — Contacts connus dans une entreprise

Sur une page entreprise, le popup affiche la liste des contacts déjà enregistrés qui travaillent dans cette entreprise. Recherche par deux stratégies :
1. Par nom d'entreprise (champ texte, insensible à la casse)
2. Par URL de la page entreprise (fallback)

### Feature C — Liaison automatique contact → entreprise

Voir section 6.5 ci-dessus.

### Feature D — Statut de prospection

Widget dans le popup (sur une page entreprise en LCM) pour changer le statut de prospection en un clic :
- 🆕 Nouveau
- 🔍 À qualifier
- 📞 À contacter
- 🤝 RDV pris
- ❄️ En veille
- 🚫 Exclu

> **Disponibilité :** fonctionne sur les deux bases (Comptes Cibles en LCM, Companies en CLIENTS).

### Feature E — Relance rapide

Boutons rapides pour poser une date de relance : +3j / +5j / +1sem / +2sem.

> **Disponibilité :** fonctionne sur les deux bases (Comptes Cibles en LCM, Companies en CLIENTS).

---

## 11. Différences entre les deux cibles — Résumé

| Aspect | LCM | CLIENTS |
|--------|-----|---------|
| Champ entreprise (contacts) | `Entreprise` (texte) | `Company Name` (texte) |
| Lien vers entreprises | `Comptes Cibles` (link) | `Entreprise` (link) |
| Enrichment Date (contacts) | ✅ Écrit | ❌ Absent |
| Enrichment Date (entreprises) | ✅ Écrit | ✅ Écrit |
| Completion (contacts) | ✅ 5 niveaux | ✅ 5 niveaux |
| Completion (entreprises) | ✅ 4 niveaux | ✅ 4 niveaux |
| Statut Prospection (contacts) | ❌ Absent | ✅ Existe |
| Statut Prospection (entreprises) | ✅ Existe | ✅ Existe |
| Table Entreprises | Riche (20+ champs) | Riche (20+ champs) |
| Table Offres emploi | ✅ Existe | ❌ Absente |
| Critère batch | `Enrichment Date = ''` | `Profile Summary = ''` |
| Features D/E (statut, relance) | ✅ Sur Comptes Cibles | ✅ Sur Companies |

---

## 12. Limites connues et précautions

1. **Batch sans PDF** : le mode batch ne génère pas de PDF (limitation technique du service worker). Le PDF sera créé lors d'un ré-import manuel.

2. **Liaison entreprise écrasante** : la Feature C (auto-liaison) remplace le lien entreprise existant. Un ré-enrichissement peut modifier le lien si l'employeur du contact a changé.

3. **Bannissement LinkedIn** : respecter le délai batch (45s recommandé). Ne pas lancer de batch en parallèle. Ne pas utiliser l'extension pendant un batch.

4. **Ré-enrichissement batch** : pour ré-enrichir un contact déjà traité en batch, il faut vider le champ marqueur (`Enrichment Date` en LCM, `Profile Summary` en CLIENTS) manuellement dans Airtable pour qu'il repasse dans la file d'attente.

5. **Un seul token Airtable** : le même token doit avoir accès aux deux bases. Vérifier les permissions du token si une base retourne des erreurs.

6. **Enrichment Date Contacts CLIENTS** : le champ `Enrichment Date` n'existe pas dans la table Contacts CLIENTS. Seul le `Profile Summary` sert de marqueur d'enrichissement pour le batch. La `Completion` est en revanche bien calculée et écrite.
