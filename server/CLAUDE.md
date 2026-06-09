# Backend N8N Forge V2 (server/)

Ce dossier contient le backend de N8N Forge V2 : services, API et intégrations utilisées par les workflows n8n.

## Fichiers importants

- `services/gemini.js` : service qui encapsule les appels au modèle Gemini.
- Autres fichiers : routes, contrôleurs, helpers (adapter cette liste si besoin).

Si tu dois comprendre la logique globale, commence par lire `services/gemini.js` puis les fichiers que je te mentionne dans mes demandes.

## Règles pour le fichier services/gemini.js

Ce fichier contient une classe `GeminiService` qui encapsule l'appel au modèle Gemini pour générer et analyser des workflows n8n.

### Ce qu'il ne faut pas casser

- Ne pas changer la **signature publique** :
  - `constructor(apiKey, model = 'gemini-2.5-flash-preview-04-17', fetcher = fetch)`
  - `async chat(history, message, context = {})`
  - `static extractWorkflowJson(text)`
  - `static detectActions(text)`
- Ne pas modifier l'URL de base de l'API Gemini sans me demander :
  - `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
- Ne jamais logguer la clé API (`this.apiKey`) ni des données sensibles dans les erreurs ou les logs.

### Ce que tu peux améliorer

- Améliorer le texte de `FORGE_SYSTEM` (clarifier les règles, ajouter des exemples) **sans changer l'esprit** : assistant spécialisé n8n, JSON strict, ids uniques.
- Renforcer la robustesse :
  - gérer les cas où `context.nodes` ou `context.workflows` sont vides ou mal formés,
  - améliorer les messages d'erreur (sans exposer la clé API),
  - ajouter de petites validations sur la réponse (`data.candidates`).
- Ajuster la configuration de génération si besoin :
  - `generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }`
  - tu peux proposer des valeurs, mais seulement avec une explication claire des impacts (qualité vs coût).

### Limites à respecter

- Garder ce fichier comme une **couche d'intégration** (appel à Gemini, formatage du prompt, parsing du retour).
- Ne pas ajouter de logique métier n8n ici (ça doit rester dans les workflows ou dans des services métier séparés).
- Ne pas multiplier les responsabilités : si la classe commence à faire trop de choses, proposer de créer d'autres modules au lieu de gonfler `GeminiService`.

## Intégration avec n8n

- Le backend fournit des services/utilitaires pour des workflows n8n.
- Séparer clairement :
  - la logique métier (dans n8n ou dans des modules métier),
  - la logique d'accès aux APIs externes (ex : Gemini dans `services/gemini.js`).
- Quand tu proposes des changements :
  - expliquer comment le backend sera appelé depuis n8n,
  - éviter de coupler trop fortement le code backend à un workflow spécifique.

## Comment je veux que tu travailles dans server/

- Proposer des modifications **locales** et bien ciblées (un ou quelques fichiers à la fois).
- Toujours préciser :
  - le nom du fichier,
  - avant/après pour les blocs de code importants,
  - une explication courte de ce que tu fais.
- Garder le style existant (formatage, nommage, façon de gérer les erreurs et les logs).
- Ne pas ajouter de nouvelles dépendances npm sans me demander.

## Commandes utiles (backend)

Les commandes Docker pour lancer le projet complet sont déjà dans le CLAUDE.md à la racine.
Ici, tu peux partir du principe que le backend tourne via Docker,
et te concentrer sur la qualité du code dans `server/`.