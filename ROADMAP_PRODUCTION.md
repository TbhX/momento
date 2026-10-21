# Momento — travaux de production

## Livraison courante : accès organisateur et modération

Le propriétaire choisit Supabase pour gérer les utilisateurs et autorise l’ouverture simple par e-mail/mot de passe. L’achat du domaine est reporté.

La cible Supabase suit désormais l’activation du fournisseur e-mail et l’autorisation de créer de nouveaux comptes. Le double interrupteur de l’hébergement a été retiré pour cette cible. Une fermeture des inscriptions laisse les membres existants se connecter ; les réglages inconnus ou indisponibles refusent les nouvelles créations. L’accueil et le formulaire affichent ces états.

Le mode de départ n’effectue pas de vérification d’adresse et ne propose pas de récupération par e-mail ; l’interface annonce ces limites. Google et SMS restent reportés. Aucun service payant n’est activé.

L’accès organisateur est désormais contrôlé par un rôle privé et une activation à code unique. Le propriétaire choisit son mot de passe sur le site. L’espace propose compteurs, signalements paginés, prise en charge et classement, suspension/rétablissement réservés aux administrateurs et historique des actions. Les comptes organisateurs sont protégés des suspensions par signalement. Les tests Gratuit/Premium restent des simulations sur l’appareil, sans achat ni droits réels.

Validation : 168 tests locaux et build Pages réussis ; données déclaratives et migrations rejouées dans une base isolée. La migration a été appliquée et les accès privés vérifiés. L’identité organisateur est préparée via Auth avec session provisoire révoquée. Le précédent compte synthétique a été supprimé après autorisation. L’activation du propriétaire, la vérification du déploiement courant et les appareils physiques restent suivis séparément.

## Priorités suivantes

1. Vérifier l’interface publiée, puis laisser le propriétaire activer son compte et choisir son mot de passe.
2. Finaliser les appels audio/vidéo et les rotations chronométrées, avec consentement et gestion des refus d’appareils.
3. Compléter la gestion des salons et le suivi opérationnel de la modération.
4. Compléter les préférences, la pagination, les matchs et messages réciproques.
5. Tester les appareils, la supervision, les sauvegardes et la restauration ; finaliser les informations publiques.
6. Valider séparément les paiements, droits, résiliations et remboursements avant toute vente.

Les rencontres publiques et les ventes restent fermées. La démonstration est explicite et séparée. La partie physique reste exclusivement un teaser. Les prix prévus sont identiques quel que soit le genre ; une entrée gratuite quotidienne et un accès Premium pendant la période active sont à faire respecter côté serveur.

Les mises à jour de routine sont autorisées après vérification, en préservant les changements du propriétaire. Consigner chaque résultat sans assimiler un push à un déploiement réussi. Les paramètres opérationnels, identifiants et détails d’infrastructure sont conservés dans le suivi privé du projet.
