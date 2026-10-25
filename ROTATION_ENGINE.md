# Moteur de rotation — contrat d’intégration

`src/domain/room-rotation.mjs` prépare un tour du format équilibré femmes/hommes pour une capacité de 20, 50 ou 100. Il s’agit d’un noyau pur, sans état partagé, base, réseau, minuterie ou accès aux appareils. Il n’est importé par aucune route de production ni par la répétition locale. Il ne constitue pas encore un ordonnanceur opérationnel.

## Entrée réservée au serveur

L’instantané comporte `eventId`, `opensAt`, `closesAt`, `capacity`, `roundIndex`, `now`, `participants`, `seenPairs` et `blockedPairs`. Les dates sont des millisecondes entières UTC. Les listes de paires contiennent deux identifiants, dans n’importe quel ordre. L’historique est celui de tout l’événement, conservé aussi après un départ, un changement de préférences ou un swipe. Il doit inclure les binômes réservés, même si l’échange échoue, afin d’éviter une nouvelle proposition du même binôme.

Chaque participant fournit : `id`, `gender` déclaré, `age`, `active`, `confirmed`, `sessionActive`, `preferencesConfirmed`, `checkedInAt`, `unavailableUntil`, `lastMatchedRound` (-1 avant toute rencontre) et `preferences`. Ces dernières contiennent les listes explicites `genders`, `intentions` (`friendship`, `love`, ou les deux), `modes` (`audio`, `video`, ou les deux), et `minAge`/`maxAge`. Les choix sont vérifiés dans les deux sens. L’intention, les préférences et le check-in persistants restent à ajouter à l’adaptateur ; ne pas fabriquer ces données à partir du profil ou de la réservation.

Les sessions, états, confirmations, blocages et présences doivent être relus côté serveur. Aucun de ces champs ne peut servir de droit s’il provient du navigateur. Une présence expire après 45 secondes dans ce modèle ; ce délai devra être aligné explicitement avec le heartbeat déployé. Un aparté en cours exclut la personne. Les données incomplètes excluent le participant ; les instantanés incohérents ou dépassant la capacité sont refusés. Les genres hors femme/homme ne sont pas réinterprétés : d’autres formats nécessitent leur propre algorithme.

## Horaires et affectation

Les dix tours commencent à `opensAt + roundIndex × 330 secondes` : 5 minutes d’échange puis 30 secondes de choix. Le moteur accepte une proposition pendant les dix premières secondes du départ seulement, sans déplacer la fin initiale. Il refuse un départ anticipé, un rattrapage tardif et un dernier tour dont la phase de choix dépasserait la fin de l’événement. Cette tolérance est une règle du noyau, pas une mesure de latence validée en exploitation. Un lancement manqué attend le tour suivant ; aucune rencontre ne commence au milieu d’un tour.

Un couplage biparti par chemins augmentants maximise le nombre de binômes possibles dans l’instantané. L’ordre est stable, avec priorité aux personnes dont la dernière rencontre est la plus ancienne ; ceci n’est pas une garantie d’équité globale. Chaque personne apparaît au maximum une fois. Les paires déjà proposées et les blocages sont exclus symétriquement. Le choix vidéo exige que les deux personnes l’aient sélectionné ; sinon seul un choix audio commun convient. Le mode proposé ne remplace jamais une autorisation explicite du navigateur.

La sortie contient les identifiants des binômes et leur mode, les horaires immuables, les exclus et les personnes en attente. `all_met` signifie que toutes les personnes actuellement présentes, compatibles et non bloquées ont déjà été rencontrées. `no_compatible_presence` et `waiting_for_pair` restent distincts : une absence ne doit pas annoncer à tort que tout le salon a été rencontré. Aucune photo, préférence, session, clé, crédit ou jeton média ne fait partie de la sortie. Celle-ci reste interne au serveur et ne doit jamais être envoyée intégralement à un membre.

## Avant raccordement réel

1. Lire un instantané cohérent et borné depuis Auth et les données privées ; vérifier aussi l’accès au salon, son environnement et toutes les autorisations de service.
2. Réserver le tour et les paires dans une transaction unique avec contraintes d’unicité par événement/paire et tour/participant, plus une clé idempotente de tour. Deux ordonnancements concurrents doivent retrouver le même résultat persisté, et non réserver deux plans différents. Revalider sous verrou la session, présence, compatibilité, fermeture, blocage et appartenance avant insertion. Conserver l’ordre des verrous des écrivains existants.
3. En cas de réponse perdue, relire le tour enregistré. Ne pas recalculer après une réservation ou un swipe. Une annulation termine le binôme sans réutiliser la personne pendant ce tour ; le suivant ne recycle pas l’historique.
4. Délivrer seulement au membre concerné un jeton limité à son binôme, son mode et son échéance. Révoquer l’accès après sortie, révocation, blocage, suspension ou fermeture, y compris sur une connexion média déjà ouverte.
5. Raccorder votes privés, prolongation consentie et départ des deux personnes de la rotation. Les validations et l’idempotence du débit existant restent obligatoires ; aucune règle financière n’est ajoutée ici.
6. Tester concurrence et interruption sur une base de développement, puis deux comptes/appareils autorisés et une charge progressive. Ne pas ouvrir les admissions par simple changement de drapeau.

## Preuves locales

Treize tests couvrent les horaires, présences, préférences réciproques, blocages, absence/retour, épuisement, invariance de l’entrée et déterminisme. Les 512 graphes possibles de trois femmes et trois hommes sont comparés à un calcul exhaustif indépendant du maximum. Des scénarios de dix tours complets sont exécutés séparément pour 20, 50 et 100 personnes, sans paire répétée ni double affectation. Ces tests ne mesurent pas une charge concurrente réelle et ne valident aucun appareil ni appel distant.

Aucun schéma, migration, droit, crédit ou état du projet hébergé n’est modifié par cette livraison. Les admissions, publications ordinaires, ventes et médias restent fermés.
