# Note stratégique — Orchestration agentique & cap business

_Rédigé le 2026-06-04 (nuit). À lire ce week-end avant de reprendre._

## 🎯 L'étoile polaire (ne jamais la perdre)
**Générer du cash = prendre des RDV qualifiés sur des comptes clients autour de Rennes et Nantes.**
Tout ce qui suit n'a qu'un but : une **base propre, fiable, à jour**, dans laquelle tu peux piocher chaque matin une **liste d'appels prête** et **tracer** ce que tu fais, pour dérouler le cycle de vente (RDV → consultation → réponse → closing).

Critère de réussite simple : *« Ce matin, combien de contacts qualifiés, avec coordonnées à jour, rattachés à un compte Rennes/Nantes, jamais contactés, suis-je capable d'appeler ? »* Tant que ce chiffre ne s'affiche pas en 1 clic, on n'a pas fini.

---

## 🩺 Le vrai risque aujourd'hui : la collision d'écritures
On a ~12 workflows, et **plusieurs peuvent écrire le même enregistrement Airtable**. Sans gouvernance → écrasements, doublons, données perdues, incohérences. C'est LE danger pour une base « propre ».

**Cause racine** : trop d'acteurs ont le droit d'écrire dans les tables finales (Companies, Contacts).

---

## 🤖 Le modèle agentique proposé : des rôles clairs + UNE seule autorité d'écriture

Penser le système comme une **équipe d'agents** avec frontières nettes :

| Agent | Rôle | Écrit où |
|-------|------|----------|
| 🛰️ **Collecteurs** (Adzuna, LinkedIn scraping, imports) | ramènent la matière brute | **staging only** (Comptes Cibles, Contacts LinkedIn) |
| 🔬 **Qualifieurs** (Gemini ESN/client, SIREN, LinkedIn) | enrichissent / jugent | annotent le **staging** |
| 🏛️ **Promoteur** (le seul à toucher le CRM) | applique l'intelligence de remplissage + journalise | **CLIENTS/Companies, CLIENTS/Contacts, SOURCING/CANDIDATS** |
| 🔗 **Réconciliateur** (linker C1/C2) | garde contacts ↔ sociétés cohérents | liens uniquement |
| 🛡️ **Sentinelle** (error workflow + checks intégrité) | surveille tout, alerte, escalade les doutes | rien — **alerte Google Chat** |
| 📣 **Rapporteur** (digest nocturne) | raconte ce qui s'est passé | rien — **Google Chat** |

**Règle d'or anti-collision** : *seul le Promoteur écrit dans le CRM.* Les autres écrivent en staging. Plus une seule table finale avec 5 mains dessus → le risque de collision s'effondre.
Renforts : **écritures décalées dans le temps** (02/03/04/05h, jamais 2 writers en même temps sur la même table) + **idempotence** (match SIREN, remplissage des vides) → rejouer un workflow ne casse rien.

---

## 🧠 L'intelligence de remplissage (à formaliser comme composant réutilisable)
Une fonction « **fusionneur** » partagée, appliquée à chaque champ selon **priorité de source + fraîcheur** :

1. **Jamais écraser** une valeur saisie par un humain (déjà en place).
2. **Remplir les vides** depuis la meilleure source dispo.
3. **Hiérarchie de sources** : LinkedIn = vérité pour la personne ; **SIREN/SIRENE** = vérité pour l'identité société ; Apollo/Adzuna = secours.
4. **Conflit de 2 données fraîches** : on garde la source prioritaire ; à source égale, la plus **récente** (horodatage).
5. **Doute non résolu** (ex. 2 SIREN différents pour le même nom, valeur fraîche qui contredit l'existant) → **on n'écrit pas, on escalade à Google Chat** pour décision humaine.
6. **Toute écriture est journalisée** (voir traçabilité).

On a déjà 80% : le matcher Phase 1 (SIREN→nom→LinkedIn) + le remplissage-des-vides. Reste à le promouvoir en **brique commune** et à brancher l'escalade.

---

## 📡 Observabilité & Google Chat (Shodo Reports)
Le système doit **parler** :
- 🚨 **Error Workflow global** : n8n permet de désigner UN workflow qui capte les erreurs de TOUS les autres → message Google Chat immédiat (workflow, nœud, message). *Le geste agentique n°1 à poser.*
- 🟠 **Escalade de doute d'intégrité** : le fusionneur, quand il hésite, poste un message « j'ai un doute sur X, que fais-je ? » + (plus tard) boutons/cases.
- 📊 **Digest nocturne** (on a déjà « Digest Nightly ») : « X cibles créées, Y qualifiées, Z promues clients, N contacts reliés, W coords manquantes ». En 30s tu sais l'état de ta base au réveil.
- ✅ **Confirmation de fin** des workflows sensibles (push CRM).

Mécanique : une **sous-routine « Notifier Google Chat »** (webhook espace Chat) réutilisée partout.

---

## 🗂️ Traçabilité = ton arme pour le cycle de vente (priorité haute)
Tu vas gérer RDV → consultations → réponses. Il te faut, **par compte et par contact**, l'historique. Deux journaux **distincts** :

1. **Journal Données** (nouveau, audit système) — 1 ligne par changement : `date | table | enregistrement | champ | ancienne valeur → nouvelle | source/workflow`. Alimenté **automatiquement par le Promoteur**. → tu sais toujours *qui a mis quoi, quand, d'où*. Rien n'est « perdu » silencieusement.
2. **Interactions / Tasks** (déjà dans CLIENTS, activité commerciale **humaine**) — appels, emails, RDV, comptes-rendus. → l'historique commercial du client.

Distinction clé : le **Journal Données** trace ce que *le système* fait aux données ; les **Interactions** tracent ce que *toi* fais au client. Les deux te protègent et te rendent opérationnel.

---

## 🚀 La couche opérationnelle « prêt à prospecter » (ce qui fait le cash)
Créer une **vue unique** dans CLIENTS = ta to-do commerciale du matin :
> Contacts qui sont : (a) rattachés à un compte client, (b) avec **email + téléphone**, (c) **Bassin Rennes ou Nantes**, (d) **jamais contactés**.

C'est ta **liste d'appels**. Couplée aux Templates + Trackings déjà présents, tu lances la prospection immédiatement et tu logues chaque action.
Indicateur à afficher chaque matin (via digest Chat) : *« N contacts prêts à appeler aujourd'hui »*.

---

## 🗺️ Roadmap proposée pour le week-end (ordre = protéger le cash d'abord)

**Bloc 1 — Gouvernance & filet de sécurité** (protège la base avant de la grossir)
1. **Error Workflow global → Google Chat** (alerte sur toute panne).
2. **Table Journal Données** + journalisation par le Promoteur.
3. Promouvoir le **fusionneur** en brique commune + branche l'escalade de doute.

**Bloc 2 — Finir la plomberie données**
4. Boucler C2 : re-jouer le linker C1 après promotion nocturne.
5. **Porte B** : routage Contacts LinkedIn → Prospect (lié société) / Ressource, avec suggestion Google Chat.
6. Nettoyage dette (fusion liens `Entreprise`/`Companies 2`).

**Bloc 3 — Mise en ordre de bataille commerciale**
7. **Vue « prêt à appeler »** (Rennes/Nantes, coords complètes, non contacté).
8. **Digest matinal** Google Chat : « X comptes, Y contacts à appeler aujourd'hui ».
9. **Analyse des trous de coordonnées** : combien de prospects sans email/tél → relancer l'enrichissement dessus en priorité (sinon pas d'appel possible).

---

## 🔒 Garde-fous « données pas perdues »
- Anti-écrasement + Journal Données = aucune perte silencieuse.
- **Jamais de hard-delete** par un workflow (archivage uniquement).
- **Snapshot hebdo** : un workflow d'export Airtable (sauvegarde) → on peut toujours revenir en arrière.

---

## 💡 3 idées à fort levier cash (à débattre)
1. **Score de chaleur du compte** (déjà amorcé : « Niveau couverture »). Prioriser les appels là où on a déjà un contact N1 = taux de RDV plus élevé.
2. **Signal d'achat = accroche d'appel** : le champ « Signal d'achat » (Adzuna : « recrute 3 dev Java ») est un **prétexte d'appel en or**. L'exposer dans la vue d'appel = meilleur taux de décroché.
3. **Décideur prioritaire** déjà calculé par le moteur de couverture → appeler la bonne personne du premier coup.

---

## 👉 Première action quand tu reprends
Je propose de démarrer par le **Bloc 1.1 — Error Workflow Google Chat** : petit, rapide, et il sécurise TOUT le reste. Puis le Journal Données. On parle « propreté et traçabilité » avant de grossir encore la base.
