# Momento — travaux de production

## Livraison courante : navigation et cadre d’application

L’interface conserve l’identité romantique de Momento dans un cadre fixe : menu latéral, vues centrales et tiroir mobile. L’accueil compact remplace la longue page de présentation. Concept, formules et confidentialité s’ouvrent dans le même espace. Les contenus longs restent accessibles par défilement interne.

Les transitions ne retardent pas le changement de vue, s’annulent à la navigation suivante et respectent la réduction des animations. Une vue en cours de chargement conserve son contenu précédent désactivé, avec indication d’attente retardée. Le menu reste disponible. Seule la dernière destination peut afficher sa réponse.

Le chargement du statut et des liens est parallèle. Les GET simultanés identiques partagent uniquement leur requête en cours. Les écritures et changements de compte invalident les lectures en attente ; aucune réponse privée terminée n’est conservée en cache. Le module vidéo est chargé à la demande, avec possibilité de réessayer. Quitter pendant ce chargement ne peut pas ouvrir ensuite une salle.

Validation locale : 181 tests réussis et build Pages réussi. Le navigateur ne peut pas ouvrir l’aperçu local dans l’environnement courant ; le contrôle du rendu publié est suivi séparément. Aucun essai sur appareil physique n’est annoncé.

L’accès organisateur et la modération de la livraison précédente restent protégés par les rôles privés. Les simulations Gratuit/Premium restent distinctes des droits du compte. L’inscription suit les réglages natifs e-mail de Supabase, avec un profil complété avant les espaces membre. Aucun domaine acheté ni service payant activé.

## Priorités suivantes

1. Contrôler le nouveau rendu publié et poursuivre les parcours mobile/ordinateur.
2. Finaliser les appels audio/vidéo et les rotations chronométrées, avec consentement et gestion des refus d’appareils.
3. Compléter la gestion des salons et le suivi opérationnel de la modération.
4. Compléter les préférences, la pagination, les matchs et messages réciproques.
5. Tester les appareils, la supervision, les sauvegardes et la restauration ; finaliser les informations publiques.
6. Valider séparément les paiements, droits, résiliations et remboursements avant toute vente.

Les rencontres publiques et les ventes restent fermées. La démonstration est explicite et séparée. La partie physique reste exclusivement un teaser. Les prix prévus sont identiques quel que soit le genre ; une entrée gratuite quotidienne et Premium pendant la période active sont à faire respecter côté serveur.

Les mises à jour de routine sont autorisées après vérification, en préservant les changements du propriétaire. Un push seul ne prouve pas un déploiement. Les paramètres opérationnels, identifiants et détails d’infrastructure restent dans le suivi privé.
