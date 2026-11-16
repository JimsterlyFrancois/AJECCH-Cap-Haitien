# AJECCH — script général et référence du projet

**Association des Jeunes Chrétiens du Cap-Haïtien**  
**Référence de cadrage pour la conception, le développement et la maintenance du site**

## 1. Finalité

La plateforme AJECCH est la vitrine numérique de l'Association des Jeunes Chrétiens du Cap-Haïtien. Elle présente l'identité de l'association, ses orientations, ses activités, ses actualités et ses événements confirmés. Elle doit aussi offrir aux responsables autorisés un espace de gestion sécurisé.

Le site doit rester fidèle à l'identité chrétienne et institutionnelle de l'association. Il ne doit pas inventer de témoignages, de chiffres d'impact, de coordonnées, de lieux, de dates ou d'annonces non validés.

## 2. Objectifs

- Présenter clairement l'association et ses engagements.
- Faciliter l'accès aux informations et aux activités.
- Valoriser les initiatives et les communications officielles.
- Permettre une gestion autonome des publications et des médias par des responsables autorisés.
- Maintenir une expérience fiable sur téléphone, tablette et ordinateur.
- Préserver la sécurité des comptes, des contenus et des données.

## 3. Identité visuelle et expérience

### Identité

Le logo officiel fourni par l'association est la référence prioritaire. Il ne doit être ni redessiné approximativement, ni déformé, ni recadré au point de supprimer des éléments de l'emblème. Le nom complet « Association des Jeunes Chrétiens du Cap-Haïtien » doit être utilisé lorsque le contexte institutionnel l'exige.

### Ciel animé et thèmes

Le fond commun repose sur un ciel procédural, construit avec CSS et les éléments animés du projet plutôt que sur une grande image de fond.

- **Mode jour :** dégradé de ciel bleu, nuages légers et ambiance lumineuse.
- **Mode nuit :** ciel sombre, lune, étoiles, voie lactée et nuages adaptés au contraste.
- La transition entre les deux modes doit être progressive.
- Le ciel doit rester visuellement continu pendant le défilement.
- Les animations décoratives doivent rester derrière le contenu et ne jamais bloquer les interactions.
- Respecter `prefers-reduced-motion` et limiter le coût des animations sur les appareils modestes.

### Surfaces et lisibilité

Les grandes sections publiques doivent laisser apparaître le fond commun. Les cartes, formulaires, fenêtres et panneaux importants peuvent conserver des surfaces translucides ou vitrées. La lisibilité du texte, des liens et des contrôles prévaut toujours sur l'effet décoratif.

## 4. Organisation fonctionnelle

Les espaces publics à maintenir comprennent :

- **Accueil :** présentation et accès rapide aux principales informations.
- **À propos :** identité, mission, vision et orientations de l'association.
- **Activités :** domaines d'action et initiatives.
- **Actualités :** publications, annonces et événements confirmés.
- **Quiz & connaissances :** questions à choix, réponses et score individuel des participants.
- **Contact :** moyens de communication officiels.

La page d'accueil peut présenter un aperçu des événements et des publications. Les informations doivent provenir de contenus validés et être gérées depuis le CMS lorsque le type de contenu est pris en charge.

L'espace **Administration** est privé et ne doit jamais être indexé comme une page publique.

## 5. Administration et rôles

Le système actuel prévoit deux sièges ADM et un accès Publication & Médias.

- **ADM — siège 1 :** contrôle les rôles, l'équipe, les candidatures administratives et l'annuaire complet des personnes inscrites.
- **ADM — siège 2 :** après validation de son inscription, dispose de pouvoirs étendus sur les contenus, les médias, les publications et les quiz. Il peut aussi désigner ou révoquer le responsable des médias à partir d'un annuaire filtré qui exclut les comptes ADM. Il ne peut pas modifier les sièges ADM, traiter les candidatures ni consulter l'identité ou la fiche de l'ADM 1.
- **Publication & Médias :** gère les actualités, annonces, événements et visuels publics, sans pouvoir attribuer des rôles.
- Les autorisations doivent être vérifiées côté serveur et par les politiques RLS Supabase.
- Une simple connexion ne donne pas automatiquement accès à l'administration.
- Le premier compte peut être créé depuis `/administration/inscription`, lien visible uniquement pendant l'initialisation. Le premier ADM est ensuite activé avec le mécanisme protégé de code unique et après confirmation de l'adresse e-mail.
- Les deux comptes ADM peuvent désigner ou révoquer le responsable des médias sans créer de compte en double. Le siège 2 voit uniquement les comptes non-ADM inscrits et confirmés ; il ne peut pas lire la fiche du siège 1.
- Seul le siège 1 peut gérer les sièges ADM, valider/refuser les candidatures et consulter l'annuaire complet.
- Les deux ADM peuvent créer des publications avec résumé court, texte long et image, ainsi que des quiz de 1 à 12 questions et 2 à 5 choix par question.
- Les réponses correctes des quiz sont stockées séparément des questions publiques. Une bonne réponse ajoute 1 point au score du participant connecté, une seule fois par question ; chaque utilisateur ne voit que son propre score.

La connexion actuellement prise en charge est l'adresse e-mail et le mot de passe via Supabase Auth. Ne pas réintroduire un bouton Google tant que le fournisseur et son parcours complet n'ont pas été explicitement configurés et testés.

## 6. Architecture technique

- **Next.js / React :** pages, composants et interfaces.
- **CSS :** système visuel, responsive, thèmes et animations.
- **Supabase Auth :** authentification.
- **Supabase Database et Storage :** données de publication, rôles et médias.
- **GitHub :** historique, branches et Pull Requests.
- **Vercel :** prévisualisation et hébergement.

Les clés privées et secrets ne doivent jamais être exposés côté navigateur ou dans le dépôt.

## 7. Performance et accessibilité

- Privilégier CSS et animations légères aux médias décoratifs lourds.
- Charger les images de contenu de manière adaptée et différée lorsque pertinent.
- Éviter les bibliothèques redondantes et le code mort.
- Préserver les contrastes dans les deux thèmes.
- Fournir des textes alternatifs adaptés aux images informatives.
- Maintenir une navigation utilisable au clavier et des libellés explicites.
- Respecter les préférences de réduction des animations.
- Tester les mises en page sur téléphone, tablette et ordinateur.

## 8. Méthode obligatoire pour les évolutions

1. Identifier la branche et le commit de référence avant de modifier le code.
2. Examiner les composants, routes, styles et migrations concernés.
3. Définir le problème et des critères d'acceptation vérifiables.
4. Modifier uniquement les éléments nécessaires.
5. Préserver les fonctionnalités existantes, les contenus et l'identité officielle.
6. Ne pas supprimer une section utile sous prétexte de nettoyer le code.
7. Vérifier les types, le lint, le build et les principaux parcours lorsque les outils le permettent.
8. Contrôler les résultats Vercel Preview avant de proposer la fusion.
9. Présenter les changements dans une Pull Request, avec résumé, fichiers concernés et contrôles réalisés.
10. Ne jamais fusionner ou déployer en production sans instruction explicite.

## 9. Critères d'acceptation permanents

Une évolution est acceptable uniquement si :

- Le logo et les textes institutionnels restent corrects.
- Les pages publiques déjà opérationnelles restent accessibles.
- Les modes jour et nuit conservent un contraste suffisant.
- Le fond animé ne masque pas le contenu et ne bloque aucun contrôle.
- Le site reste utilisable sur petit écran et avec réduction des animations.
- Les comptes non autorisés ne peuvent ni consulter ni modifier les fonctions d'administration.
- ADM 2 peut gérer le responsable des médias, mais ne peut pas lire la fiche ADM 1 ni les demandes d'accès administratives.
- Les rôles sont contrôlés dans Supabase, pas seulement dans l'interface.
- Les publications et quiz non publiés ne sont pas accessibles aux visiteurs anonymes.
- Les bonnes réponses des quiz ne sont jamais incluses dans le contenu public et les participants ne peuvent consulter que leurs propres réponses.
- Aucun secret ou renseignement privé n'est ajouté au code.
- Le build et les vérifications disponibles ne signalent pas de régression.

## 10. État de référence Git

Dépôt : [JimsterlyFrancois/AJECCH-Cap-Haitien](https://github.com/JimsterlyFrancois/AJECCH-Cap-Haitien)

La branche par défaut du dépôt est `main`. Les évolutions du ciel animé et de la connexion administrative par e-mail ont été travaillées sur `feature/ajecch-admin-cms`, où la PR #13 a été fusionnée. Cette fusion dans une branche de fonctionnalité ne signifie pas que les mêmes changements sont déjà présents dans `main` ou en production.

Toujours comparer les branches avant une intégration. Ne pas transférer une branche divergente vers `main` sans examiner les différences et les éventuels conflits.

## 11. Documents complémentaires

- `docs/administration-ajecch.md` : accès, demande et validation du second ADM, publications, quiz et scores.
- `supabase/migrations/` : historique des changements de base de données.
- Les migrations et données historiques liées à Google peuvent rester présentes pour compatibilité ; elles ne doivent pas être présentées comme un parcours actuellement actif.

**Règle directrice :** chaque changement doit rendre le site plus clair, plus fiable, plus léger ou plus facile à gérer, sans sacrifier l'identité de l'AJECCH, la sécurité ni les fonctions qui marchent déjà.
