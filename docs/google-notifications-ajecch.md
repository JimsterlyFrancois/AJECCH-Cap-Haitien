# Connexion Google et notifications AJECCH

## Connexion Google
Le bouton « Connecter Google » utilise Supabase Auth avec le fournisseur Google et les scopes minimaux `openid email profile`. Le retour OAuth est traité par `/auth/callback`.

À configurer avant utilisation :
1. Dans Google Cloud Console, créer un identifiant OAuth 2.0 de type application Web.
2. Ajouter l'URL de callback Supabase affichée dans Authentication → Providers → Google comme URI de redirection autorisée.
3. Dans Supabase → Authentication → Providers → Google, activer le fournisseur et renseigner le Client ID et le Client Secret.
4. Dans Supabase → Authentication → URL Configuration, autoriser les URL publiques du site et leurs chemins de callback.

## Abonnement aux notifications
Après consentement explicite via le bouton Google, le callback enregistre l'adresse vérifiée dans `public.ajecch_notification_subscribers`. La migration `20261114010000_ajecch_google_notifications.sql` doit être appliquée dans Supabase avant d'activer le bouton en production.

**Limite importante :** cette version enregistre l'abonnement et l'adresse de destination. Elle ne lit pas la boîte Gmail et ne déclenche pas encore l'envoi de courriels. L'envoi des notifications AJECCH nécessite un fournisseur transactionnel (SMTP ou API) et une fonction serveur/Edge Function. Aucun accès Gmail supplémentaire n'est demandé.

## Reconnaissance des administrateurs
La connexion Google ne confère aucun privilège d'administration. Le site affiche le rôle uniquement si l'identifiant Supabase connecté possède déjà une entrée active dans `public.ajecch_admins`. Les contrôles d'accès existants et les politiques RLS restent l'autorité.
