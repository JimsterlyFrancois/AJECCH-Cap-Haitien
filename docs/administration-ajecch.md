# AJECCH — guide d’administration

## 1. Rôles et responsabilités

La gestion repose sur trois accès administratifs :

- **Super Admin — siège 1** : contrôle complet du site, des publications, des médias, de l’équipe et des rôles.
- **Super Admin — siège 2** : mêmes autorisations que le siège 1.
- **Publication & Médias** : crée, publie, modifie et supprime les actualités, annonces et événements ; gère les images publiques. Ce rôle ne peut pas attribuer de rôles ni administrer l’équipe.

Les sièges actifs sont uniques en base. Le système empêche la désactivation ou la suppression du dernier Super Admin actif.

## 2. Connexion actuelle

- Adresse : `/administration/connexion`
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

1. Dans Supabase **Authentication → Users**, créer le compte du premier responsable avec son adresse e-mail et son mot de passe.
2. Vérifier que l'adresse e-mail est confirmée selon la configuration Auth du projet.
3. Dans le **SQL Editor** Supabase, récupérer le code privé non utilisé :

   ```sql
   select token
   from private.ajecch_bootstrap_tokens
   where used_at is null
   limit 1;
   ```

4. Transmettre ce code uniquement au premier responsable, par un canal privé et sûr. Ne pas le placer dans GitHub, dans le navigateur ou dans une variable publique.
5. Le responsable se connecte sur `/administration/connexion`, ouvre `/administration`, indique son nom et saisit le code.
6. Le code est consommé lors de l'activation du siège Super Admin 1. Il ne doit pas être réutilisé.

Si cette table avait été créée sur une ancienne base sans la protection attendue, le propriétaire doit vérifier son état avant toute initialisation et appliquer, si nécessaire, la commande de durcissement documentée dans la migration. Ne pas désactiver RLS pour faciliter l'activation.

## 5. Ajouter un responsable après l'initialisation

Le parcours d'invitation automatisé n'est pas encore disponible dans l'interface. En attendant, le propriétaire Supabase doit effectuer l'attribution depuis le SQL Editor, après avoir créé le compte du responsable dans **Authentication → Users** et vérifié son identité.

Exemple pour attribuer le rôle **Publication & Médias** (siège unique disponible) :

```sql
insert into public.ajecch_admins (
  user_id, display_name, email, role, seat, is_active, created_by
)
select
  u.id,
  'NOM DU RESPONSABLE',
  u.email,
  'publisher',
  1,
  true,
  (
    select user_id
    from public.ajecch_admins
    where role = 'super_admin' and seat = 1 and is_active = true
    limit 1
  )
from auth.users as u
where lower(u.email) = lower('adresse@example.com')
  and not exists (
    select 1 from public.ajecch_admins as existing
    where existing.user_id = u.id
  );
```

Pour attribuer le siège Super Admin 2, remplacer `'publisher'` par `'super_admin'` et conserver `seat = 2`. Ne jamais attribuer le siège 1 à un autre compte. Si le siège demandé est déjà occupé, vérifier d'abord les responsables actifs ; ne pas contourner l'index unique ou le déclencheur de protection du dernier Super Admin.

Cette opération est réservée au propriétaire autorisé de la base. Ne pas demander aux utilisateurs de s'attribuer eux-mêmes un rôle et ne jamais insérer un rôle depuis le navigateur.

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
- Les politiques RLS et les fonctions SQL vérifient les droits côté base.
- Le middleware protège les routes d'administration contre les visiteurs non connectés ; la page serveur vérifie ensuite le rôle.
- Le contrôle visuel d'un bouton ou d'un lien n'est jamais considéré comme une mesure de sécurité.
- Aucun secret privé ne doit apparaître dans le code client.

## 8. Migrations

Les migrations de référence sont conservées dans `supabase/migrations/`. Les migrations relatives aux anciennes demandes Google sont conservées pour assurer l'historique et la compatibilité des données ; elles ne signifient pas que le fournisseur Google est activé ou utilisé par l'interface actuelle.

Avant toute modification de schéma, vérifier les migrations déjà présentes et l'état réel du projet Supabase. Ne pas appliquer une migration à l'aveugle sur une base existante.
