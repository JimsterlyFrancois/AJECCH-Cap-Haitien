# AJECCH — Site public et espace de gestion

Plateforme officielle de l’Association des Jeunes Chrétiens du Cap-Haïtien.

## Technologies
- Next.js 15, React 19 et TypeScript
- Supabase Auth, PostgreSQL et Storage
- CSS responsive, thèmes jour/nuit et ciel animé
- Vercel pour les prévisualisations et l’hébergement

## Installation
```bash
npm install
npm run dev
```

Ouvrir ensuite http://localhost:3000.

## Pages publiques
- Accueil, À propos, Activités et Actualités
- Agenda des événements issus des publications validées
- Quiz et connaissances avec compte participant et score personnel
- Coordonnées et liens de contact officiels

## Administration
- Connexion par e-mail et mot de passe avec Supabase Auth
- Deux sièges ADM avec droits contrôlés par les fonctions SQL et les politiques RLS
- Rôle Publication & Médias
- Gestion des publications, annonces, événements et médias publics
- Gestion des quiz, avec bonnes réponses conservées dans un schéma privé

Une session connectée ne confère pas automatiquement de privilèges administratifs. Les autorisations sont vérifiées côté serveur et dans Supabase.

## Médias et contenus
Le site ne doit pas remplacer les visuels officiels absents par des photographies de stock présentées comme des images de l’association. Les images des publications se gèrent depuis l’onglet Publications. Les emplacements médias non utilisés sont conservés dans la base mais ne sont pas proposés comme éléments actifs de l’interface.

Les textes institutionnels, les activités, les coordonnées et les annonces doivent être validés par les responsables de l’AJECCH avant publication.

## Vérifications
```bash
npm run lint
npm run build
```

Les changements de schéma sont livrés dans `supabase/migrations/`. Ne pas exécuter une migration sur la base de production avant d’avoir vérifié l’état réel du schéma et les migrations déjà appliquées.
