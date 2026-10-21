# État de préparation de Momento

Cette livraison simplifie la gestion des utilisateurs : Supabase Auth pilote l’activation e-mail et l’ouverture des nouveaux comptes. L’ancien double interrupteur de l’hébergement ne ferme plus la cible Supabase. Le formulaire garde la connexion disponible quand seules les inscriptions sont fermées.

## Vérifié

- 161 tests locaux réussis et build Pages réussi.
- Lecture du vrai service Auth : inscription simple autorisée, Google/SMS inactifs.
- Tests des erreurs et réglages inconnus, fermeture/réouverture des nouveaux comptes, connexion existante et messages de l’interface.
- Protections antérieures de session, quotas et accès entre comptes conservées.

Les contrôles de création, profils, relations et suppression sur les vraies API de la livraison précédente constituent une preuve séparée. La lecture actuelle d’Auth ne remplace pas un nouvel essai complet sur le site publié.

## À terminer avant les rencontres publiques

Appels audio/vidéo et rotations, modération et administration, choix réciproques et messages, pagination, essais iOS/Android, exploitation et restauration, informations publiques de l’exploitant et revue des conditions.

Les ventes et droits payants exigent leurs essais complets et leur validation distincte. Les rencontres physiques restent un teaser. Une PWA installable ne signifie pas que les applications sont publiées sur les stores.

Le résultat du déploiement doit être vérifié directement ; un push GitHub n’est pas une preuve suffisante. Les détails opérationnels et identifiants d’infrastructure sont conservés dans le suivi privé.
