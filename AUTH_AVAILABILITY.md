# Rétablir la disponibilité des comptes

## Reconnaître l’incident

Une page publique HTTP 200 et un déploiement Pages réussi ne prouvent pas que les comptes sont disponibles. Le contrôle de disponibilité doit aussi lire `/api/auth/config` sans cookie ni credentials. Une réponse 503 `auth_provider_unavailable` signifie que le Worker n’a pas pu lire une configuration Auth utilisable ; elle ne prouve pas à elle seule que le projet est en pause.

Le 14 novembre 2026, cette erreur a été observée alors que le projet natif était déclaré inactif. La remise en service du projet existant a été demandée, sans réinitialisation de compte ni changement des gardes. La cause de l’inactivité n’a pas été établie.

## Diagnostic et remise en service

1. Récupérer le head courant et vérifier le commit réellement déployé.
2. Vérifier l’identité du projet dans le suivi privé, puis son état avec le connecteur natif. Ne jamais intervenir sur un projet au nom seulement ressemblant.
3. Lire les logs et advisors accessibles. Tenter la lecture de l’historique ; si la base est indisponible, consigner cette limite et relire après reprise. Ne rejouer aucune migration.
4. Si le projet est inactif et sa reprise autorisée, demander la remise en service du projet existant. Ne pas recréer le projet, restaurer une ancienne sauvegarde, modifier les clés ou activer un abonnement pour contourner l’incident.
5. Attendre la fin du démarrage avec des lectures espacées. Une demande acceptée ou un état de démarrage n’est pas une preuve de rétablissement.
6. Après retour à un état sain, relire l’historique et les gardes d’ouverture. Contrôler RLS et les advisors ; ne pas changer les autorisations pour obtenir un succès.
7. Exécuter les deux contrôles HTTP ci-dessous et noter séparément leurs résultats. Un compte réellement connecté et les appareils restent des validations distinctes.

```sh
node scripts/verify-security.mjs https://momento-7se.pages.dev/
node scripts/verify-public.mjs https://momento-7se.pages.dev/
```

Si le projet est sain mais que le 503 persiste, examiner les logs Auth et la configuration du Worker sans imprimer les valeurs secrètes. Conserver le refus des créations lorsque les réglages natifs sont inconnus ; ne pas remplacer la lecture par une valeur « inscriptions ouvertes » codée en dur.

## Avant ouverture

Prévoir une supervision de la disponibilité Auth, une procédure d’escalade et un responsable. Ne pas envoyer automatiquement de messages à des tiers ni générer du trafic artificiel pour empêcher une mise en pause. Aucun contrôle de santé ne doit créer de compte, crédit, réservation ou rencontre. Conserver hors du dépôt les identifiants opérationnels, diagnostics contenant des données personnelles et secrets.
