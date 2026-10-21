# État de préparation de Momento

Cette livraison simplifie la gestion des utilisateurs : Supabase Auth pilote l’activation e-mail et l’ouverture des nouveaux comptes. L’ancien double interrupteur de l’hébergement ne ferme plus la cible Supabase. Le formulaire garde la connexion disponible quand seules les inscriptions sont fermées.

## Vérifié

- 168 tests locaux réussis et build Pages réussi.
- Lecture du vrai service Auth : inscription simple autorisée, Google/SMS inactifs.
- Tests des erreurs et réglages inconnus, fermeture/réouverture des nouveaux comptes, connexion existante et messages de l’interface.
- Protections antérieures de session, quotas et accès entre comptes conservées.
- Formulaire d’inscription ouvert observé sur le site publié ; précédent compte synthétique et profil supprimés après autorisation.
- Identité organisateur préparée via Auth ; session provisoire révoquée et activation personnelle requise.
- Administration : rôles privés, code à usage unique, signalements paginés, contrôle des actions concurrentes, suspension/rétablissement et historique.
- Tests des données déclaratives et du rejeu des migrations, accès refusés aux membres ordinaires et sessions révoquées.

Les contrôles complets de création, profils, relations et suppression sur les vraies API des livraisons précédentes constituent une preuve séparée. L’activation du propriétaire, le parcours complet d’administration sur le site publié et les appareils physiques restent à vérifier. Les simulations Gratuit/Premium ne créent aucun droit payant.

## À terminer avant les rencontres publiques

Appels audio/vidéo et rotations, gestion complète des salons et traitement opérationnel des signalements, choix réciproques et messages, pagination du catalogue et des relations, essais iOS/Android, exploitation et restauration, informations publiques de l’exploitant et revue des conditions.

Les ventes et droits payants exigent leurs essais complets et leur validation distincte. Les rencontres physiques restent un teaser. Une PWA installable ne signifie pas que les applications sont publiées sur les stores.

Le comportement d’inscription est confirmé sur le site publié ; l’identifiant exact du déploiement n’a pas été obtenu. Un push GitHub seul n’est pas une preuve suffisante. Les détails opérationnels et identifiants d’infrastructure sont conservés dans le suivi privé.
