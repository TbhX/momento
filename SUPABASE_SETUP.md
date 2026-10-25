# Supabase dans Momento

Supabase est utilisé pour les comptes Auth, profils et consentements, médias privés, catalogue des salons, relations, invitations, blocages et signalements. Les services non raccordés restent fermés et la démonstration est présentée comme telle.

Le schéma déclaratif et les migrations versionnées se trouvent dans `supabase/`. Les derniers ajouts couvrent les accords de prolongation et les salons créés par les membres, avec tables privées et droits séparés. Les contrôles d’accès entre comptes et la révocation des sessions demeurent requis.

Le site suit désormais les réglages Auth natifs pour l’e-mail et la création de nouveaux comptes. La fermeture des inscriptions doit préserver la connexion existante. Le mode simple sans confirmation d’adresse est choisi pour démarrer ; aucune récupération par e-mail n’est proposée. Google et SMS restent reportés.

Les paramètres sensibles sont configurés dans les services et conservés dans le suivi privé. Ne copier aucune clé ou donnée personnelle dans ce dépôt public. Vérifier le projet cible dans ce suivi avant toute opération distante.

318 tests locaux et build Pages réussis pour la livraison des salons personnalisables. La lecture réelle d’Auth confirme que l’inscription simple est autorisée ; vérifier ensuite le formulaire effectivement publié. Les essais SQL et API des livraisons précédentes sont distincts. Les appels, admissions et ventes restent fermés.

## Salons créés par les membres

Les schémas `60_hosted_rooms.sql` et `70_community_directory.sql` ajoutent les brouillons, liens, réservations et droits de publication privés, ainsi que les répertoires paginés. Le drapeau de publication est désactivé par défaut, indépendant des autorisations d’appels et de paiement. Les nouveaux droits `room_host` ne peuvent venir du navigateur ; le versement après achat reste à relier aux webhooks avant toute vente. Les tests `hosted-rooms.test.mjs` rejouent les règles sur le schéma déclaré et l’historique des migrations, uniquement en local. Voir `PRICING_AND_CAPACITY.md` pour les règles et limites.

### Publication réservée aux tests administrateur

`80_admin_test_rooms.sql` ajoute une publication dédiée, liée à Auth, au rôle privé admin activé et à l’environnement de test. Les salons concernés portent `is_test`, sont accessibles par lien uniquement et ne consomment aucun crédit ni création Premium incluse. La fonction d’admission les refuse systématiquement. Les participants peuvent vérifier des réservations explicitement marquées comme tests ; aucun token média n’est créé. Les tests rejouent aussi la révocation du rôle et de la session, la propriété, l’idempotence et la fermeture des publications ordinaires. Les tables privées gardent RLS et aucun accès direct membre.

### Photos des salons

`90_salon_photos.sql` ajoute une fonction privée de résolution liée à la session et au Premium natif, exposée par un wrapper SECURITY INVOKER. Elle vérifie salon visible, présence active, compte actif et blocages, et limite les lectures. L’image n’est téléchargée via le serveur que si ce contrôle retourne une référence autorisée. Les vignettes gratuites sont un fichier neutre, sans copie de la photo nette. Aucun droit sur Storage n’est ajouté aux membres. Les tests rejouent le schéma et l’historique dans des bases isolées.
