# AJECCH — guide d’administration

## 1. Rôles et responsabilités

La gestion repose sur trois accès administratifs :

- **ADM — siège 1** : contrôle complet du site et seul compte autorisé à gérer les accès administratifs, parcourir la liste des comptes inscrits et désigner ou révoquer le responsable des médias.
- **ADM — siège 2** : gère les publications et les médias du site, mais ne peut pas consulter l'annuaire des comptes ni attribuer ou révoquer des rôles.
- **Publication & Médias** : crée, publie, modifie et supprime les actualités, annonces et événements ; gère les images publiques. Ce rôle ne peut pas administrer l'équipe.

Les sièges actifs sont uniques en base. Le système empêche la désactivation ou la suppression du dernier ADM actif. Le libellé visible des comptes Super Admin est simplement **ADM**.

## 2. Connexion actuelle

- Adresse de connexion : `/administration/connexion`
- Création du premier compte : `/administration/inscription`, affichée uniquement tant qu'aucun Super Admin actif n'existe.
- Méthode : adresse e-mail et mot de passe via Supabase Auth.
- L'accès à `/administration` exige une session authentifiée et un rôle actif dans `public.ajecch_admins`.
- Une session authentifiée ne confère aucun privilège administratif à elle seule.
- La connexion Google n'est pas le parcours pris en charge actuellement. Les anciennes demandes enregistrées dans `ajecch_admin_access_requests` sont conservées à titre historique ; elles ne constituent pas un formulaire public actif.

## 3. Variables Vercel

Configurer les variables suivantes dans les environnements Production, Preview et Development :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Ne jamais exposer une clé `service_role`, un jeton d'initialisation ou un secret administratif dans le navigateur, une variable `NEXT_PUBLIC_*`, le dépôt Git ou une Pull Request.

## 4. Première activation du Super Admin

Cette procédure est réservée au propriétaire technique ou à une personne autorisée à administrer le projet Supabase.

1. Ouvrir `/administration/connexion` puis cliquer sur **Créer le premier compte administrateur**. Ce lien n'apparaît que tant que le système n'a pas de Super Admin actif.
2. Saisir le nom, l'adresse e-mail et un mot de passe. Supabase crée le compte et envoie un e-mail de confirmation lorsque la confirmation d'adresse est activée.
3. Ouvrir le message de confirmation et suivre le lien. Le retour sécurisé doit ramener à `/administration`.
4. Si la création ne peut pas être réalisée depuis le site, le propriétaire technique peut créer le compte depuis Supabase **Authentication → Users** puis vérifier l'adresse e-mail.
5. Dans le **SQL Editor** Supabase, récupérer le code privé non utilisé :

   ```sql
   select token
   from private.ajecch_bootstrap_tokens
   where used_at is null
   limit 1;
   ```

6. Transmettre ce code uniquement au premier responsable, par un canal privé et sûr. Ne pas le placer dans GitHub, dans le navigateur ou dans une variable publique.
7. Le responsable se connecte sur `/administration/connexion`, ouvre `/administration`, indique son nom et saisit le code.
8. Le code est consommé lors de l'activation du siège Super Admin 1. Il ne doit pas être réutilisé.

Si cette table avait été créée sur une ancienne base sans la protection attendue, le propriétaire doit vérifier son état avant toute initialisation et appliquer, si nécessaire, la commande de durcissement documentée dans la migration. Ne pas désactiver RLS pour faciliter l'activation.

## 5. Désigner ou révoquer le responsable des médias

Cette gestion est disponible dans l'espace du compte **ADM** (siège 1) :

1. Ouvrir **Équipe & accès**.
2. Consulter la rubrique **Comptes inscrits sur le site**.
3. Rechercher la personne par son nom ou son adresse e-mail.
4. Vérifier l'identité affichée et confirmer que l'adresse e-mail est validée.
5. Cliquer sur **Désigner responsable**. Le compte existant reçoit alors le rôle **Publication & Médias**, sans nouvelle inscription.
6. Pour retirer l'accès, utiliser **Révoquer cet accès** dans la carte du responsable actuel.

Un seul responsable des médias peut être actif à la fois. Pour le remplacer, révoquer d'abord son accès, puis désigner un autre compte inscrit. La révocation désactive l'accès et conserve l'historique du compte ; elle ne supprime pas le compte Auth.

L'annuaire affiche uniquement le nom, l'adresse e-mail, l'état de confirmation et la date d'inscription. Son accès et les opérations d'attribution/révocation sont contrôlés par des fonctions SQL et des politiques RLS : le compte ADM 2, les éditeurs et les visiteurs ne peuvent pas utiliser ces opérations.

## 6. Bibliothèque média et publications

Le bucket public `ajecch-public-media` sert les médias destinés au site. Les formats prévus sont JPG, PNG, WebP et AVIF, avec une limite applicative de 8 Mo.

Emplacements média connus :

- `brand.logo`
- `home.hero`
- `home.actions`
- `home.gallery`
- `home.contact`

Les publications utilisent les catégories actualité, annonce et événement. Seules les publications au statut publié sont visibles publiquement. Les brouillons restent réservés aux comptes administratifs autorisés.

## 7. Sécurité

- Supabase Auth authentifie les comptes.
- `public.ajecch_admins` détermine les rôles actifs.
- Les politiques RLS et les fonctions SQL vérifient les droits côté base. Seul le siège ADM 1 peut lire l'annuaire des inscrits et gérer les rôles administratifs.
- Le middleware protège les routes d'administration contre les visiteurs non connectés ; la page serveur vérifie ensuite le rôle.
- Le contrôle visuel d'un bouton ou d'un lien n'est jamais considéré comme une mesure de sécurité.
- Aucun secret privé ne doit apparaître dans le code client.

## 8. Migrations

Les migrations de référence sont conservées dans `supabase/migrations/`. Les migrations relatives aux anciennes demandes Google sont conservées pour assurer l'historique et la compatibilité des données ; elles ne signifient pas que le fournisseur Google est activé ou utilisé par l'interface actuelle.

Avant toute modification de schéma, vérifier les migrations déjà présentes et l'état réel du projet Supabase. Ne pas appliquer une migration à l'aveugle sur une base existante.
