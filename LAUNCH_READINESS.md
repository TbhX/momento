# État de préparation de Momento

Cette livraison apporte le cadre fixe, le menu latéral et la navigation entre panneaux, avec des transitions dans l’identité de Momento. Les longues listes et formulaires restent accessibles dans la zone centrale. Le menu devient un tiroir sur mobile.

## Vérifié localement

- 193 tests et build Pages réussis.
- Clics rapides, réponses tardives, erreurs de chargement et retour arrière avec restauration du défilement interne.
- Menu mobile au clavier : ouverture, boucle de focus, fermeture par Échap ou navigation.
- Transitions immédiates, annulables et désactivées selon la préférence de réduction des animations.
- Requêtes membre parallèles, partage limité aux GET en cours, invalidation après écriture et changement de compte ; aucune réponse privée terminée en cache.
- Module vidéo absent du chargement initial, requête partagée, reprise après erreur et abandon sans ouverture de salle après navigation.
- Protection des comptes, sessions, profils, quotas, rôles administrateur et accès entre comptes conservée par la suite de tests.
- Palettes automatiques selon le genre déclaré, choix manuel séparé par compte, retour au mélange visiteur à la déconnexion et gestion du stockage indisponible.
- Modification facultative du genre limitée au profil actif connecté, avec rejet des valeurs et champs étrangers ; aucune nouvelle colonne ni privilège.
- Confidentialité intégrée à l’application, avec document complet accessible séparément.

Le cadre fixe publié a été observé dans un navigateur de bureau : accueil sans défilement à la taille contrôlée, concept, formules, formulaire d’inscription, confidentialité longue avec défilement interne et retour arrière. Le module de conférence est absent du chargement initial.

L’aperçu local est inaccessible au navigateur dans cet environnement. La colonne de genre facultatif et ses droits existants ont été vérifiés par lecture du schéma distant, sans modifier de profil réel. Le contrôle du dernier lot de palettes reste distinct des tests automatisés et est consigné dans le suivi privé. Les simulations et tests isolés ne constituent pas un essai sur smartphone ou un appel réel à deux appareils.

## Acquis des livraisons précédentes

Comptes e-mail/mot de passe pilotés par Supabase Auth, profils et images privés, catalogue et relations persistants, administration et historique. Les inscriptions suivent les réglages du service ; l’adresse n’est pas vérifiée et la récupération par e-mail n’est pas disponible. Google et SMS restent reportés.

Les vérifications de l’authentification, de l’activation administrateur et des API distantes des livraisons précédentes sont distinctes de la vérification visuelle de cette livraison. Les simulations Gratuit/Premium n’accordent aucun droit payant.

## À terminer avant les rencontres publiques

Appels audio/vidéo et rotations, gestion complète des salons et traitement opérationnel des signalements, choix réciproques et messages, pagination, essais iOS/Android, exploitation et restauration, informations publiques de l’exploitant et revue des conditions.

Les ventes et droits payants exigent leur validation distincte. Les rencontres physiques restent un teaser. Une PWA installable ne signifie pas que les applications sont publiées sur les stores. Les identifiants et détails d’exploitation ne sont pas documentés dans ce dépôt public.
