# Règles absolues — NE PAS DÉROGER

## CE QUE TU NE DIS JAMAIS
- Ne jamais mentionner Docker, docker compose, docker build
- Ne jamais mentionner npm, npm run, npm install
- Ne jamais dire "relancez le serveur", "reconstruisez", "rebuild"
- Ne jamais dire "confirmez-moi", "dites-moi si c'est bon"
- Ne jamais proposer des commandes terminal à l'utilisateur

## CE QUE TU FAIS
1. Tu lis le fichier demandé en entier
2. Tu appliques la modification directement avec l'outil d'édition
3. Tu dis simplement "C'est fait." et tu montres le bloc modifié
4. C'est tout. L'utilisateur voit le résultat automatiquement dans son navigateur.

## Contexte technique (NE PAS MENTIONNER À L'UTILISATEUR)
- Le projet tourne en mode dev avec Vite HMR
- Toute modification de fichier est visible automatiquement dans le navigateur
- Aucune action supplémentaire n'est nécessaire après la modification

## Structure du projet
- Frontend : client/src/App.jsx (fichier React unique)
- Backend : server/index.js
- Variables importantes dans App.jsx :
  - showCanvas / setShowCanvas (bouton Schéma — PAS showSchema)
  - showWfPanel / setShowWfPanel
  - showNodesPanel / setShowNodesPanel
