# Conditions d’ouverture publique

État au 5 novembre 2026 : site de découverte et comptes accessibles. Les rencontres réelles, la publication ordinaire et les ventes restent fermées. Aucun nombre de tests locaux ne vaut validation des appels réels ni autorisation commerciale.

## Ordre de passage

| Étape | Critère de passage et preuve à conserver | État |
| --- | --- | --- |
| Version publique | Tests et build Pages, commit déployé identique, cinq pages publiques, fichiers de démarrage, erreurs 404, refus API sans session et cross-site | Contrôles automatisés disponibles ; exécuter à chaque livraison |
| Comptes | Domaine et expéditeur configurés ; confirmation et récupération testées sur comptes autorisés ; MFA administrateur et révocation validées | Mode mot de passe simple actif ; courriels et essais authentifiés à terminer |
| Préparation des appels | Delta de préparation appliqué avec historique exact, gardes relues et régression SQL ; ordonnanceur persistant, check-in et préférences réciproques | Delta de préparation encore en attente ; ordonnanceur réel à raccorder |
| Médias | Jetons réservés au binôme et à son échéance ; deux appareils autorisés ; départ, refus, déconnexion, blocage, reconnexion et expiration | Non validé ; aucun média réel ouvert |
| Capacité | Pilote 20, puis 50/100 ; latence, erreurs, bande passante et coût mesurés ; refus de double affectation et absence de répétition | Tests locaux disponibles ; mesures staging et appels réels à effectuer |
| Exploitation | Alerte d’erreurs sans secrets, restauration de sauvegarde démontrée, procédure de retour au commit précédent, modération et support organisés | À valider avant lancement commercial |
| Vente | Acceptation de l’activité par le prestataire, Checkout et webhooks signés/idempotents, remboursements, prix et crédits concordants | Fermé ; un retour navigateur ne doit jamais créer un droit |
| Cadre du service | Identité de l’éditeur, contact, documents contractuels et confidentialité adaptés, traitements de données revus | À compléter avec les informations réelles du propriétaire ; aucune identité inventée |
| Acquisition | Événement pilote réellement terminé, coût par participant présent et taux de retour mesurés | Publicité à engager après validation du pilote |

## Vérifications reproductibles

- `pnpm test`, puis `pnpm run build:pages` avant tout push de code.
- `node scripts/verify-security.mjs https://momento-7se.pages.dev/` : en-têtes et refus sans credentials, aucun compte créé.
- `node scripts/verify-public.mjs https://momento-7se.pages.dev/` : pages, référencement, fichiers publics, configuration Auth et 404. Ce contrôle ne déclare jamais les médias ni l’ouverture commerciale validés.
- Vérifier le hash du déploiement Cloudflare, puis recharger le navigateur et parcourir accueil, connexion, inscription et retour. Ne pas utiliser le compte du propriétaire pour des essais automatiques.
- Conserver les résultats authentifiés et physiques séparément des résultats locaux et des lectures SQL distantes.

Les huit ambiances, les profils fictifs, les choix de chaise, les affinités détaillées et les réactions locales ne constituent pas un pool réel. Ne pas présenter ces éléments comme des présences ou des interactions entre clients. Les offres gratuites ou payantes des fournisseurs ne suppriment aucun de ces critères d’ouverture.
