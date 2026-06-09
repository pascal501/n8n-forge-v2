# Extension Chrome — LinkedIn → Airtable

Enregistre un contact LinkedIn dans la base **Contact LinkedIn Management** en un clic :
champs texte, photo de profil et **vrai PDF natif LinkedIn**.

## Installation (mode développeur)

1. Ouvre Chrome → `chrome://extensions`
2. Active le **mode développeur** (interrupteur en haut à droite)
3. Clique **"Charger l'extension non empaquetée"**
4. Sélectionne le dossier `extensions/linkedin-airtable/`
5. L'icône apparaît dans la barre d'outils

## Configuration (une seule fois)

Clic droit sur l'icône → **Options** :

| Champ | Où le trouver |
|-------|--------------|
| **Token Airtable** | [airtable.com/create/tokens](https://airtable.com/create/tokens) |
| **Base ID** | URL Airtable : `airtable.com/`**appXXXX**`/tblXXX/...` |
| **Table ID** | URL Airtable : `airtable.com/appXXX/`**tblXXXX**`/...` |

### Scopes requis sur le token Airtable
- `data.records:read` — recherche de doublons
- `data.records:write` — création / mise à jour des contacts
- `schema.bases:read` — résolution des champs pièces jointes (photo, PDF)

## Utilisation

1. Ouvre un profil LinkedIn (`linkedin.com/in/…`)
2. Clique sur l'icône de l'extension
3. Vérifie les données affichées
4. Clique **Enregistrer**

⏱️ La sauvegarde prend ~7-10 s : l'extension ouvre un onglet en arrière-plan
pour récupérer les coordonnées et déclenche le téléchargement du PDF natif.

## Champs remplis automatiquement

| Champ Airtable | Source LinkedIn |
|----------------|----------------|
| Prénom / Nom | Nom du profil (split) |
| Poste | Tagline sous le nom |
| Entreprise | Après « chez » / panneau d'infos |
| Email | Onglet caché → clic "Coordonnées" → `mailto:` |
| Téléphone | Onglet caché → clic "Coordonnées" → `tel:` |
| LinkedIn URL | URL de la page (clé de doublon) |
| Profile Summary | Section "À propos" (`#about`) |
| Photo Profile | Photo CDN LinkedIn |
| Profile PDF | **PDF natif LinkedIn** ("Plus → Enregistrer au format PDF") |

## Gestion des doublons

Avant de créer un contact, l'extension cherche un record avec la **même LinkedIn URL** :
- **Trouvé** → le contact existant est **mis à jour** (tous les champs rafraîchis,
  photo et PDF remplacés). Le popup affiche « Contact mis à jour ».
- **Non trouvé** → **création** d'un nouveau contact.

## Architecture technique

```
popup.js ─── scrapeProfile ──→ content.js  (DOM : nom, poste, photo, résumé)
   │
   └── saveToAirtable ──→ background.js
                              ├─ getContactInfoViaTab()   onglet caché → Coordonnées
                              ├─ getNativePDF()            world:"MAIN" → intercepte fetch
                              ├─ findExistingRecord()      doublon par LinkedIn URL
                              └─ Airtable POST/PATCH + uploadAttachment
```

### Points clés / pièges contournés
- **`world: "MAIN"`** : l'interception de `window.fetch` (pour capter le PDF natif)
  DOIT se faire dans le monde principal de la page. Les content scripts tournent
  dans un monde isolé et ne voient pas le `fetch` de LinkedIn.
- **Coordonnées** : LinkedIn rend l'email/téléphone côté client (React). Un simple
  `fetch()` de `/overlay/contact-info/` renvoie du HTML vide → il faut charger le
  profil puis cliquer "Coordonnées" dans un vrai onglet.
- **PDF natif** : récupéré via l'endpoint `linkedin.com/ambry/?x-li-ambry-ep=…`
  extrait de la réponse RSC du bouton "Enregistrer au format PDF".
- **Sélecteurs robustes** : le nom est dans un `H2` (pas H1), la photo via
  `img[alt^="Voir le profil de"]`, le résumé via l'ancre `#about`. Les classes CSS
  LinkedIn sont obfusquées et changent à chaque déploiement — on les évite.

## Limites connues
- Les **emojis** dans le PDF de fallback (généré localement) sont remplacés par des
  espaces. Le PDF natif LinkedIn n'a pas ce problème.
- Si LinkedIn change l'interface (texte des boutons, structure du menu), il faudra
  réinspecter les sélecteurs dans `content.js` et `background.js`.
