# État de préparation de Momento

Cette livraison apporte le cadre fixe, le menu latéral et la navigation entre panneaux, avec des transitions dans l’identité de Momento. Les longues listes et formulaires restent accessibles dans la zone centrale. Le menu devient un tiroir sur mobile.

## Vérifié localement

- 181 tests et build Pages réussis.
- Clics rapides, réponses tardives, erreurs de chargement et retour arrière avec restauration du défilement interne.
- Menu mobile au clavier : ouverture, boucle de focus, fermeture par Échap ou navigation.
- Transitions immédiates, annulables et désactivées selon la préférence de réduction des animations.
- Requêtes membre parallèles, partage limité aux GET en cours, invalidation après écriture et changement de compte ; aucune réponse privée terminée en cache.
- Module vidéo absent du chargement initial, requête partagée, reprise après erreur et abandon sans ouverture de salle après navigation.
- Protection des comptes, sessions, profils, quotas, rôles administrateur et accès entre comptes conservée par la suite de tests.
- Confidentialité intégrée à l’application, avec document complet accessible séparément.

L’aperçu local est inaccessible au navigateur dans cet environnement. Le rendu réellement publié doit être contrôlé séparément du build et du push. Les simulations locales et tests isolés ne constituent pas un essai d’appel réel à deux appareils.

## Acquis des livraisons précédentes

Comptes e-mail/mot de passe pilotés par Supabase Auth, profils et images privés, catalogue et relations persistants, administration et historique. Les inscriptions suivent les réglages du service ; l’adresse n’est pas vérifiée et la récupération par e-mail n’est pas disponible. Google et SMS restent reportés.

Les vérifications de l’authentification, de l’activation administrateur et des API distantes des livraisons précédentes sont distinctes de la vérification visuelle de cette livraison. Les simulations Gratuit/Premium n’accordent aucun droit payant.

## À terminer avant les rencontres publiques

Appels audio/vidéo et rotations, gestion complète des salons et traitement opérationnel des signalements, choix réciproques et messages, pagination, essais iOS/Android, exploitation et restauration, informations publiques de l’exploitant et revue des conditions.

Les ventes et droits payants exigent leur validation distincte. Les rencontres physiques restent un teaser. Une PWA installable ne signifie pas que les applications sont publiées sur les stores. Les identifiants et détails d’exploitation ne sont pas documentés dans ce dépôt public.
