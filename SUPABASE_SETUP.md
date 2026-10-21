# Supabase dans Momento

Supabase est utilisé pour les comptes Auth, profils et consentements, médias privés, catalogue des salons, relations, invitations, blocages et signalements. Les services non raccordés restent fermés et la démonstration est présentée comme telle.

Le schéma déclaratif et les migrations versionnées se trouvent dans `supabase/`. Cette livraison ne modifie ni le schéma ni les rôles. Les contrôles d’accès entre comptes et la révocation des sessions demeurent requis.

Le site suit désormais les réglages Auth natifs pour l’e-mail et la création de nouveaux comptes. La fermeture des inscriptions doit préserver la connexion existante. Le mode simple sans confirmation d’adresse est choisi pour démarrer ; aucune récupération par e-mail n’est proposée. Google et SMS restent reportés.

Les paramètres sensibles sont configurés dans les services et conservés dans le suivi privé. Ne copier aucune clé ou donnée personnelle dans ce dépôt public. Vérifier le projet cible dans ce suivi avant toute opération distante.

161 tests locaux et build Pages réussis pour cette livraison. La lecture réelle d’Auth confirme que l’inscription simple est autorisée ; vérifier ensuite le formulaire effectivement publié. Les essais SQL et API des livraisons précédentes sont distincts. Les appels, admissions et ventes restent fermés.
