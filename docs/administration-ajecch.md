# AJECCH — guide d’administration

## 1. Rôles et responsabilités

La gestion repose sur trois accès administratifs :

- **ADM — siège 1** : contrôle les accès administratifs, gère les candidatures ADM et peut consulter l'annuaire complet des comptes inscrits. Il peut désigner ou révoquer le responsable des médias.
- **ADM — siège 2** : après inscription et validation, dispose de pouvoirs étendus sur les contenus du site : modification des publications et données éditoriales, gestion des images, création des quiz, désignation et révocation du responsable des médias. Il ne peut ni modifier les sièges ADM, ni traiter les candidatures administratives, ni consulter l'identité ou la fiche de l'autre ADM. Son annuaire de nomination exclut les comptes ADM.
- **Publication & Médias** : rôle historique distinct, limité aux publications et aux images publiques. Il ne peut pas administrer l'équipe.

Les sièges actifs sont uniques en base. Le système empêche la désactivation ou la suppression du dernier ADM actif. Le libellé visible des comptes Super Admin est simplement **ADM**.

## 2. Connexion actuelle

- Adresse de connexion : `/administration/connexion`
- Première activation : `/administration/inscription`, disponible tant qu'aucun ADM 1 n'existe.
- Candidature au second accès ADM : la même adresse `/administration/inscription` affiche le formulaire de candidature uniquement quand le siège 2 est libre et qu'aucune autre candidature n'est en attente.
- Méthode : adresse e-mail et mot de passe via Supabase Auth.
- L'accès à `/administration` exige une session authentifiée et un rôle actif dans `public.ajecch_admins`.
- Une session authentifiée ne confère aucun privilège administratif à elle seule.
- La connexion Google n'est pas le parcours pris en charge actuellement.
- L'ADM 2 doit confirmer son adresse e-mail. Après le retour du lien de confirmation, sa demande est enregistrée et le compte affiche « En attente de validation ». L'ADM 1 est le seul à pouvoir valider ou refuser cette candidature.
- Le candidat ne reçoit pas l'identité de la personne qui examine la demande. Les fonctions SQL de consultation de sa demande ne retournent aucun identifiant de réviseur.

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

## 5. Validation du second accès ADM

1. Le candidat ouvre `/administration/inscription` pendant que le siège 2 est libre.
2. Il crée son compte avec son nom, son adresse e-mail et un mot de passe.
3. Il confirme son adresse e-mail depuis le message envoyé par Supabase.
4. Il revient automatiquement sur `/administration` et voit l'état « En attente de validation ».
5. Dans **Équipe & accès**, ADM 1 examine la candidature et choisit **Valider l'accès** ou **Refuser**.
6. Après validation, l'utilisateur reçoit le siège ADM 2 et peut se connecter à son tableau de bord. Il peut gérer les contenus et les médias ainsi que le responsable des médias ; l'identité de l'ADM 1, les sièges ADM et les candidatures restent masqués.

La base de données limite la candidature à un siège 2 et une demande en cours. L'accès ne devient actif qu'après confirmation de l'e-mail et approbation par ADM 1. L'interface et les fonctions de consultation du candidat ne révèlent pas le nom ni l'identifiant du compte ADM 1.

## 6. Désigner ou révoquer le responsable des médias

Cette gestion est disponible dans l'espace des deux comptes **ADM**. Le siège 1 conserve l'annuaire complet ; le siège 2 dispose d'une liste de comptes non-ADM, sans identité d'un autre administrateur.

1. Ouvrir **Équipe & accès**.
2. Consulter la rubrique **Comptes inscrits sur le site**.
3. Rechercher la personne par son nom ou son adresse e-mail.
4. Vérifier l'identité affichée et confirmer que l'adresse e-mail est validée.
5. Cliquer sur **Désigner responsable**. Le compte existant reçoit alors le rôle **Publication & Médias**, sans nouvelle inscription.
6. Pour retirer l'accès, utiliser **Révoquer cet accès** dans la carte du responsable actuel.

Un seul responsable des médias peut être actif à la fois. Pour le remplacer, révoquer d'abord son accès, puis désigner un autre compte inscrit. La révocation désactive l'accès et conserve l'historique du compte ; elle ne supprime pas le compte Auth.

L'annuaire de nomination affiche le nom, l'adresse e-mail, l'état de confirmation et la date d'inscription. Le siège 1 peut voir les comptes inscrits, tandis que le siège 2 ne reçoit que les comptes non-ADM. Les deux ADM peuvent attribuer ou révoquer le rôle Publication & Médias par des fonctions SQL protégées. Les politiques RLS empêchent le siège 2 de lire la fiche de l'ADM 1 ou les candidatures administratives, et empêchent les éditeurs et visiteurs d'utiliser ces opérations.

## 7. Bibliothèque média, publications et quiz

Le bucket public `ajecch-public-media` sert les médias destinés au site. Les formats prévus sont JPG, PNG, WebP et AVIF, avec une limite applicative de 8 Mo.

Emplacements média connus :

- `brand.logo`
- `home.hero`
- `home.actions`
- `home.gallery`
- `home.contact`

Les publications utilisent les catégories actualité, annonce et événement. Chaque publication peut inclure un texte court (résumé), un texte complet et une image de couverture téléversée directement. Les images sont limitées à 8 Mo et aux formats JPG, PNG, WebP et AVIF. Seules les publications au statut publié sont visibles publiquement. Les brouillons restent réservés aux comptes administratifs autorisés.

Les deux comptes ADM peuvent créer des quiz comportant de 1 à 12 questions, chacune avec 2 à 5 choix, et désigner une seule bonne réponse. La bonne réponse est conservée dans une table privée ; elle n'est pas incluse dans les données publiques du quiz. Après sa première participation, une question et sa correction ne peuvent plus être modifiées.

## 8. Participation et score individuel

- La page publique des quiz est accessible à `/quiz`.
- Pour répondre et conserver ses points, chaque participant se connecte ou crée un compte participant distinct.
- Une bonne réponse rapporte 1 point. Une réponse incorrecte rapporte 0 point.
- Un compte ne peut répondre qu'une seule fois à une question donnée. Une tentative répétée ne rapporte aucun point supplémentaire.
- Le score est calculé à partir des réponses de l'utilisateur connecté. Chaque participant ne peut consulter que ses propres réponses et son propre score ; aucun classement public n'est exposé.

## 9. Sécurité

- Supabase Auth authentifie les comptes.
- `public.ajecch_admins` détermine les rôles actifs.
- Les politiques RLS et les fonctions SQL vérifient les droits côté base. Seul le siège ADM 1 peut lire l'annuaire complet et gérer les sièges ADM. Les deux ADM peuvent consulter les comptes non-ADM et gérer le responsable des médias.
- Le middleware protège les routes d'administration contre les visiteurs non connectés ; la page serveur vérifie ensuite le rôle.
- Le contrôle visuel d'un bouton ou d'un lien n'est jamais considéré comme une mesure de sécurité.
- Aucun secret privé ne doit apparaître dans le code client.

## 10. Migrations

Les migrations de référence sont conservées dans `supabase/migrations/`. Les migrations relatives aux anciennes demandes Google sont conservées pour assurer l'historique et la compatibilité des données ; elles ne signifient pas que le fournisseur Google est activé ou utilisé par l'interface actuelle.

Avant toute modification de schéma, vérifier les migrations déjà présentes et l'état réel du projet Supabase. Ne pas appliquer une migration à l'aveugle sur une base existante.
