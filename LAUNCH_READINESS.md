# Momento — état de la bêta privée

État actuel au 20 octobre 2026 : la cible autonome est accessible sur `https://momento-7se.pages.dev/` ; connexion et services métier restent fermés faute de configuration. L’organisation Supabase Momento est créée en Free ; le connecteur ne voit encore que Volteo et refuse les opérations sur Momento. Le propriétaire indique avoir préparé Supabase après le blocage de quota ; sa disponibilité reste à revérifier avec le bon accès. Le schéma préparé est dans `supabase/schemas/` et testé localement ; il ne remplace pas encore D1/R2. Les sections ci-dessous conservent les validations et limites du prototype Sites privé. Ce document ne vaut pas validation juridique ni autorisation d’ouverture des rencontres.

La liste courante et priorisée des travaux est [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md). Google et e-mail/mot de passe sont les connexions demandées ; le SMS reste désactivé sans solution gratuite établie. La tâche quotidienne GitHub/Cloudflare est activée à partir du 21 octobre 2026. Les anciennes limites Premium et offres mentionnées dans l’historique ne doivent pas être réintroduites comme règles de l’offre actuelle.

Livraison e-mail du 20 octobre : inscription, confirmation/renvoi, connexion et récupération implémentés, modèles français et protections serveur inclus. **129 tests locaux réussis**, build Pages vérifié ; SMTP, Supabase et parcours sur appareils réels restent à configurer/valider. `AUTH_EMAIL_ENABLED` reste désactivé par défaut. Voir le protocole et ses limites dans [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md).

## Implémenté

- Connexion Sites/ChatGPT et inscription Momento obligatoire ; prénom, majorité déclarée, âge, ville.
- Profils R2 ; réservations, participants, choix, messages, blocages et signalements D1.
- Quotas côté serveur : gratuit 1 participation/jour et 1 réservation ; Premium préparé à 5/jour et 3 réservations, sans activation commerciale.
- Deux groupes compatibles déclarés de 10 ; réservation atomique, plafond de groupe, interdiction des chevauchements.
- Présence à confirmer ; démarrage organisateur avec 20 présents ; 100 paires distinctes sur 10 rotations de 5 minutes + 30 secondes, temps serveur.
- Démarrage transactionnel : une erreur de quota annule toute la transaction.
- Choix privés, réciprocité obligatoire après la session, messages gratuits, isolation par compte.
- Signalement avec blocage, revue organisateur et suspension ; export JSON et suppression des données actives du compte.
- Espace organisateur réservé à une identité configurée côté serveur ; brouillons d’événements et journal des actions.
- Interface responsive, PWA installable, absence de cache des réponses authentifiées.
- Catalogue réel vide tant qu’aucun événement n’est ouvert ; aucun achat fictif dans le parcours principal.

## Services externes et ouverture

Le runtime utilise `DB` (D1) et `BUCKET` (R2), provisionnés par Sites. Les migrations Drizzle sont incluses dans l’archive de déploiement. Ne jamais modifier une migration déjà appliquée.

`MOMENTO_ADMIN_EMAIL` : adresse propriétaire de confiance, stockée comme secret Sites. L’autorisation dépend de l’en-tête d’identité fourni par Sites, jamais d’un champ navigateur.

`LIVE_EVENTS_ENABLED=false` garde les réservations réelles fermées aux nouveaux événements.

Intégration Daily préparée : `DAILY_API_KEY`, salles privées par paire, jetons de 5 minutes, 2 participants maximum, fin imposée par le serveur fournisseur. `VIDEO_VALIDATED=true` ne doit être défini qu’après tests réels : rotation, reconnexion, mauvais réseau, caméras/microphones, Android/iOS, 20 connexions simultanées, expulsion immédiate après blocage/suspension/annulation. L’expulsion avec interdiction de rejoindre est implémentée via `/rooms/:name/eject` pour les blocages, suspensions, suppressions et annulations. Elle doit encore être validée avec le fournisseur ; un échec est signalé et les jetons restent bornés à la fin du tour. Aucun appel Daily réel n’a été vérifié.

Identité juridique et contacts : `COMPANY_LEGAL_NAME`, `SUPPORT_EMAIL`, `PRIVACY_CONTACT`, puis `LEGAL_VALIDATED=true` uniquement après publication des mentions/CGU/confidentialité valides. La page actuelle est une notice de bêta, pas des documents juridiques complets. La présence des variables ne remplace pas les documents.

## Paiements — non opérationnels

Les achats retournent volontairement une indisponibilité. Aucun droit Premium ne peut être créé depuis le navigateur. Ne pas modifier la base manuellement pour simuler une souscription commerciale.

À implémenter après connexion du prestataire : catalogue/prix définitifs, checkout, signatures de webhooks, idempotence des événements, droits liés à la période réellement payée, résiliation, rétractation/remboursements applicables, factures et rapprochement financier. Les seconds rendez-vous payants et leur consentement/réservation/consommation ne sont pas encore implémentés côté serveur.

Hypothèses produit : Premium 9,90 €/mois, 4 seconds rendez-vous inclus ; achat isolé 2,90 €. À valider avec les coûts vidéo, support, modération, TVA et commissions. Aucun revenu réel ni marge garantie.

## Avant accès public

1. Authentification grand public indépendante de ChatGPT si souhaitée ; récupération de compte ; dispositif de majorité approprié, lutte contre comptes multiples et contournement de suspension.
2. Politique de confidentialité juridiquement validée, base légale par traitement, consentements facultatifs lorsque nécessaires, sous-traitants/transferts documentés ; analyser la nécessité d’une AIPD.
3. Politique de conservation différenciée et purge automatique ; sauvegardes et test de restauration ; conservation de preuves proportionnée. La suppression actuelle retire aussi les signalements associés : une politique de sécurité dédiée reste nécessaire.
4. Modération avec responsables, délais, traitement des mineurs, recours, support accessible, dispositif d’expulsion fournisseur et preuve technique de son fonctionnement.
5. Revoir les événements expirés non démarrés, report/remboursement automatique, accès aux anciens choix, cas d’absence et de suppression pendant session ; actuellement gestion manuelle organisateur.
6. Observabilité et alertes sans données sensibles, suivi incidents, tests de charge réels, audit sécurité indépendant, contrôle d’accessibilité et essais sur appareils réels.
7. Domaine et nom de marque à vérifier ; coordonnées de l’éditeur et messages transactionnels configurés ; aucune adresse fictive.

## iOS et Android

La PWA existe, aucun binaire natif ni soumission store n’est livré. Avant stores : choix de l’architecture mobile (React Native/Expo ou adaptation native appropriée), navigation et autorisations natives, deep links, notifications, session/reconnexion et suppression du compte dans l’app. Construire et signer les binaires via les comptes Apple Developer/Google Play du propriétaire, tester TestFlight et piste fermée Android, vérifier les règles des stores en vigueur au moment du dépôt, achats/restauration par plateforme, déclarations de confidentialité, classification d’âge, contact de sécurité enfance et modération. Une simple enveloppe web ne garantit pas l’acceptation.

## Vérification

Tests Node : comptes, ancien domaine prototype et nouveaux endpoints sur SQLite local avec les migrations réelles. Couvre autorisations, quotas, groupe complet, idempotence, transaction de démarrage, paires uniques, messages réciproques, blocage et suppression.

Ces tests ne remplacent pas l’environnement D1 distant ni les tests de charge, Daily ou appareils réels. Aucun navigateur de QA n’est disponible dans cette session. Ne pas annoncer le produit prêt pour le public ou les stores.

Référence fournisseur utilisée : https://docs.daily.co/reference/rest-api/rooms/session/eject (consultée le 17 octobre 2026).

## Stripe — mise à jour du 19 octobre 2026

Compte utilisé par la clé runtime, vérifié par GET /v1/account : `acct_1QSoRMGWrdJxXmG3`. Le nom du compte ne suffit pas à l'identifier. Le connecteur ChatGPT a exposé d'autres comptes ; ne pas créer de doublons dans ceux-ci.

Tarifs reconnus avec la clé runtime :
- Premium : `price_1US3rLGWrdJxXmG3sBRcWYSB`, 990 centimes EUR.
- Second rendez-vous : `price_1US3rqGWrdJxXmG3hHcmdm7E`, 290 centimes EUR.

Le propriétaire a confirmé le bon fonctionnement du test d'abonnement. Le nouveau paiement unique reste à essayer dans l'espace organisateur. Les tarifs sont validés côté serveur avant Checkout (Premium mensuel, second rendez-vous non récurrent). L'intégration reste exclusivement en mode test, sans droits Premium réels et sans réservation vidéo vendue.

### Laboratoire

Checkout à 2,90 €, session réutilisée pendant sa validité, une seule commande test confirmée par organisateur. Retour Stripe vers l'espace organisateur et vérification serveur automatique à son ouverture. Le retour navigateur n'est jamais une preuve de paiement. La synchronisation du laboratoire vérifie montant, devise, prix, client, statut du paiement et remboursement. Un crédit fictif est stocké comme état absolu ; les notifications répétées ne l'incrémentent pas.

Les abonnements de test sont synchronisés dans `billing_test`, séparément de `members.premium_until`. L'état actif et la facture payée sont requis, la résiliation et l'expiration retirent les droits de test. Un remboursement ou litige notifié suspend les droits du client de test jusqu'à revue : cette règle prudente devra être affinée par commande pour la production. Les données du laboratoire sont incluses dans l'export utilisateur et effacées localement avec son profil ; nettoyage Stripe et résiliation à la suppression restent à finaliser avant commercialisation.

### Notifications obligatoires avant commercialisation

Récepteur préparé : `/api/stripe/test-webhook`, secret serveur `STRIPE_TEST_WEBHOOK_SECRET` (valeur `whsec_…`, jamais dans le code ou le chat). HMAC-SHA256 sur corps brut, tolérance temporelle 5 minutes, rejet mode réel, déduplication, nouvelle lecture des objets Stripe au traitement et protection contre les écritures de synchronisation obsolètes. Échecs retournés à Stripe pour nouvelle tentative.

Événements : checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed, charge.refunded, charge.dispute.created.

**Non connecté :** le site est privé, avec visiteurs autorisés. Stripe ne peut pas traverser cette barrière de connexion. Il faut un récepteur serveur accessible à Stripe et protégé par signature, sur un hébergement approprié, avant de configurer la destination et son secret. Ne pas publier le site ni mettre de jeton Sites dans l'URL du webhook pour contourner cette restriction. Les tests locaux signés ne prouvent pas la livraison Stripe sur l'hébergement. Les droits publics restent désactivés.

Secrets existants : STRIPE_TEST_SECRET_KEY, STRIPE_TEST_PRICE_ID, STRIPE_TEST_SECOND_DATE_PRICE_ID. Permissions minimales : lecture des prix, abonnements, factures, Checkout Sessions et PaymentIntents/charges pour constater remboursements ; écriture clients, Checkout Sessions et portail client. Aucune clé dans le code ou le client. Les cartes doivent être des cartes de test uniquement.

Avant lancement : valider livraison webhook, renouvellement, paiements différés, échecs, annulations, remboursements, suppression de compte, véritable rendez-vous accepté par les deux participants et crédit consommé une seule fois. TVA/Stripe Tax et éventuelles inscriptions fiscales à configurer et valider avant encaissement ; automatic_tax n'est pas activé.

## Parcours vidéo — 19 octobre 2026

- Préparation accessible depuis Mes sessions et l'espace organisateur : aperçu local caméra, niveau micro, son de test, confirmation puis arrêt des pistes avant entrée. Aucun enregistrement/envoi de l'aperçu. Arrêt automatique après deux minutes et à la navigation.
- Salle d'attente réservée aux inscrits, comptage agrégé des présences par groupe, entrée au lancement et sortie si annulation. Pas de noms des autres participants exposés dans le lobby.
- Chronomètre local ancré au temps serveur et au début de la requête : pas de prolongation due à la latence. Retrait de l'iframe à l'échéance, à la perte réseau et à la navigation ; nouvelle autorisation serveur à la reconnexion. Le fournisseur reste responsable de l'expiration du jeton, notamment si le navigateur suspend ses timers.
- Tableau organisateur : présences A/B, état de la configuration vidéo. Aucun changement des garde-fous de publication et de démarrage (20 présences, vidéo validée, cadre juridique validé et ouverture explicite).
- 46 tests Node réussis, incluant autorisation lobby, génération de jetons privés temporaires (fournisseur simulé), transitions date/vote/date, fin de session et refus après blocage. Vérifications syntaxiques et build réussis. Pas de validation navigateur ni de vrai appel vidéo : contrôle navigateur indisponible.

Blocage actuel confirmé dans les noms des variables runtime : `DAILY_API_KEY` absente. Enregistrer cette clé exclusivement dans les paramètres serveur secrets Sites, puis déployer pour l'appliquer. Ne pas marquer `VIDEO_VALIDATED=true` avant essais sur appareils réels. Réaliser d'abord les essais techniques à deux puis une répétition de 20 adultes : Safari iOS, Chrome Android, desktop, refus caméra/micro, Bluetooth, coupure réseau et changement d'onglet, expiration des jetons, blocage immédiat et absence d'accès à la salle précédente. Les résultats de ces essais sont nécessaires avant ouverture.

## Répétition vidéo privée à deux appareils

L'espace organisateur propose « Tester un appel sur deux appareils ». L'organisateur crée un test de 5 minutes et ouvre son lien sur un second appareil connecté au même compte organisateur. Choisir A sur le premier et B sur le second. Le lien contient seulement un identifiant de test et un emplacement ; les jetons restent délivrés au navigateur après autorisation serveur. Aucun droit public ni session à 20 n'est ouvert.

Salle privée limitée à deux connexions, identifiants distincts A/B, participants non propriétaires, jetons liés à la salle et à son échéance, enregistrement désactivé. Les tests en cours sont réutilisés ; cinq nouvelles tentatives par jour maximum, sans garantie sur le solde gratuit global du compte Daily. Une participation de deux appareils pendant 5 minutes utilise au plus 10 minutes-participants. Le bouton de fin révoque les deux identifiants avec interdiction de retour et le serveur refuse toute nouvelle délivrance. En cas d'échec fournisseur, le message précise que l'expiration à cinq minutes reste la borne de sécurité.

Les informations `video_test` sont incluses dans l'export et supprimées localement avec le compte. Les salles fournisseur expirent à leur échéance ; la suppression du profil local ne supprime pas instantanément leurs journaux fournisseur. Le résultat du test humain n'est pas automatiquement assimilé à `VIDEO_VALIDATED=true`.

49 tests automatisés réussis. À réaliser par le propriétaire : créer le test, joindre A/B sur deux appareils, vérifier son/image dans les deux sens et la coupure automatique, puis tester l'arrêt anticipé. Aucun de ces contrôles humains n'est déclaré effectué par l'agent.

## Migration LiveKit Cloud — 19 octobre 2026

Fournisseur actif demandé : LiveKit Cloud, plan Build gratuit à conserver. Trois secrets runtime requis : LIVEKIT_URL (wss://…livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET. VIDEO_PROVIDER=livekit bloque tout repli automatique vers Daily, même si son ancienne clé demeure enregistrée. L'ancien adaptateur Daily ne sert qu'aux tests de non-régression et n'est plus sélectionné sur le site.

SDK navigateur livekit-client 2.23.0 installé et servi depuis le site, sans CDN à l'exécution. Vidéo plafonnée côté client à 640×360/20fps et débit cible 350 kbit/s, sans simulcast pour réduire les données. Commandes caméra, micro et activation du son ; arrêt et libération des pistes à la sortie ou à l'échéance.

JWT HS256 signés dans le Worker, périmètre exact de la salle et identité opaque ; aucune permission d'administration/egress/données. JWT de connexion très courts (30 s maximum), permissions caméra et micro uniquement. Révocation Cloud par RemoveParticipant avec revoke_token_ts explicite, puis DeleteRoom, lors d'un blocage ou arrêt du test. Les appels aux API serveur sont des POST Twirp authentifiés et ne dévoilent pas les erreurs brutes ni les secrets.

**Différence importante avec Daily : l'expiration JWT LiveKit ne coupe pas un participant déjà connecté.** La fin de créneau déclenche une déconnexion SDK et un arrêt serveur depuis les navigateurs ; le statut du laboratoire ferme aussi sa salle expirée lors du polling. Cette logique doit être validée en conditions réseau réelles. Un ordonnanceur serveur indépendant des navigateurs reste nécessaire pour garantir la fermeture d'une salle même si tous les clients cessent de contacter le backend. Les sessions publiques restent donc désactivées et VIDEO_VALIDATED n'est pas activé automatiquement.

51 tests Node réussis, incluant signature des JWT, permissions limitées, absence de repli vers Daily quand LiveKit est incomplet et révocation explicite des deux appareils. Les tests API utilisent un fournisseur simulé ; un diagnostic serveur de connexion doit encore confirmer les vraies clés. Le compte Cloud doit rester sur Build : quotas bloquants, pas de passage à une offre payante effectué par l'agent.

## Salon mobile et répétition sur un seul appareil — 19 octobre 2026

Nouvelle entrée après inscription : Salon, Amis, Rendez-vous. Le format de démonstration représente un salon de 20 places avec l'utilisateur et 19 profils fictifs. Les cartes se parcourent librement au doigt, avec les flèches du clavier ou les boutons. Les demandes d'ami, choix privés et rendez-vous de 15 minutes sont testables séparément. L'ancienne session chronométrée de 10 rotations conserve son moteur serveur ; le nouveau salon libre ne modifie pas ses règles.

La répétition n'appelle ni LiveKit ni Stripe. Les réponses des profils sont explicitement simulées par l'organisateur (acceptation, refus, demande reçue). Une salle vidéo fictive de 60 secondes représente un rendez-vous de 15 minutes. Les boutons micro/caméra ne demandent aucune permission matérielle. Ce parcours ne valide ni un vrai appel, ni la tenue d'une session avec vingt connexions.

### Profils de test et rôles

Le rôle administrateur réel reste contrôlé côté serveur par l'identité et MOMENTO_ADMIN_EMAIL. Le sélecteur de test n'apparaît que lorsque `/api/service/status` confirme ce rôle. Il propose trois profils de démonstration distincts : administrateur, utilisateur gratuit, utilisateur Premium. Chacun a son propre état dans sessionStorage, sous l'identifiant du compte connecté. Ce sont des contextes d'essai, pas des identités ni des abonnements réels nouvellement créés. Un changement de contexte ne modifie aucun droit serveur et ne permet pas à un membre réel d'accéder aux API administrateur.

### Modèle commercial retenu pour le salon

Même prix quels que soient le genre et les personnes recherchées. Gratuit : 1 salon/jour et 1 proposition en attente ; Premium envisagé 9,90 €/mois : 5 salons/jour, 3 propositions en attente et 4 rendez-vous de 15 minutes inclus par mois. Swipes libres dans le salon, demandes d'ami gratuites, accord réciproque requis. Hors crédit inclus : 2,90 € envisagés pour les deux, un seul payeur et aucun coût pour l'invité. Aucun paiement de démo n'appelle Stripe. Le crédit de démo se consomme une seule fois au démarrage du rendez-vous accepté ; refus et annulation avant démarrage n'en consomment pas. Il faudra implémenter et vérifier ces nouveaux quotas et relations côté serveur avant ouverture du salon réel.

Ce choix de prix commun simplifie l'offre, évite d'inciter un genre à subventionner l'autre et s'inscrit dans le principe d'égalité de traitement d'accès aux biens et services (directive 2004/113/CE, article 4). Les conditions commerciales finales et leur revue juridique restent requises avant vente.

Les rencontres en physique sont exclusivement un teaser « Bientôt », sans lieu, partenaire annoncé, date, réservation ou achat disponible. Aucun financement ni offre sur place n'est activé.

58 tests automatisés réussis, dont consentement, séparation des profils, paiement fictif après accord, crédit consommé une seule fois après rechargement, blocage, plafonds et chevauchement de rendez-vous. Build et vérification syntaxique réussis. Inspection visuelle sur appareils réels à effectuer : aucun navigateur de contrôle pris en charge n'est disponible dans cet environnement.

## Boutique, accès aux salons et consentement appareils — 19 octobre 2026

Cette section remplace les hypothèses de la section précédente : le plafond Premium de cinq salons et les rendez-vous physiques ou vidéo programmés à 2,90 € ne constituent plus l’offre actuelle.

### Parcours actuel de la répétition

Inscription obligatoire. Aperçu gratuit des 19 profils fictifs des salons, y compris lorsqu’une entrée est déjà active ailleurs. Regarder ne consomme aucun accès. Une entrée gratuite par jour civil Europe/Paris, consommée après consentement et obtention des appareils choisis. Une sortie volontaire conserve cette consommation ; la reprise technique du même salon ne consomme rien de plus. Après sortie, une entrée achetée permet de revenir le même jour. Les accès achetés inutilisés restent dans le solde, y compris après minuit. Les choix et compteurs sont conservés localement par compte et profil d’essai. Seul l’organisateur dispose de la remise à zéro de démonstration. Ces compteurs restent contournables par modification du stockage local : un moteur de salons, capacité et transactions serveur est nécessaire avant ouverture à de vrais membres.

Choix pour toutes les offres : vidéo + audio, audio seul, vidéo seule. Seuls les appareils choisis sont demandés après un clic explicite. Refus, annulation et réponse tardive après fermeture du dialogue ne consomment aucun droit ; toute piste tardive est arrêtée. Aperçu local, niveau micro, commandes de coupure et arrêt des pistes à la navigation, sortie, déconnexion, changement de profil et après deux minutes. Aucun autre participant réel n’est connecté à cet aperçu. Le laboratoire LiveKit à deux appareils et le moteur historique de rotations demeurent distincts et fermés au public.

### Prix proposés TTC et règles de formule

| Offre | Prix proposé | Droits du parcours d’essai |
| --- | --- | --- |
| Gratuit | 0 € | Aperçus, une entrée par jour, swipes et demandes d’ami dans le salon |
| Une entrée | 0,99 € | Une entrée supplémentaire, sortie volontaire consommée |
| Trois entrées | 2,49 € | Trois accès conservés jusqu’à utilisation |
| Un accès vidéo privé | 1,90 € | Un échange de 15 minutes après accord des deux ; invitation gratuite |
| Premium découverte | 1,90 € / 7 jours | Tous les salons et accès vidéo ; aucun renouvellement automatique, un essai par compte |
| Premium mensuel | 9,90 € / mois | Tous les salons et réentrées pendant la période active, accès vidéo après accord |
| Premium annuel | 69,90 € / an | Mêmes droits ; facturation annuelle unique, équivalent arrondi 5,83 €/mois |

Même prix pour tous les genres. Les places et règles de sécurité restent applicables, trois invitations vidéo actives au maximum pour tous. Le destinataire doit être ami avec l’émetteur dans la répétition. Une demande est gratuite ; refus et annulation avant démarrage ne consomment pas de crédit. Le crédit est consommé une seule fois après acceptation, présence réciproque simulée et autorisation des appareils. Un aperçu privé local de deux minutes représente le futur format de quinze minutes ; il ne déclenche aucun appel réel.

Résiliation gratuite du renouvellement à tout moment : maintien jusqu’à l’échéance payée. Rétractation avec remboursement : fin de l’accès de la formule, sans suppression des autres accès achetés. Garantie commerciale de remboursement intégral sous quinze jours pour la souscription initiale mensuelle ou annuelle. La semaine payante n’est pas qualifiée de systématiquement non remboursable : demande expresse de démarrage immédiat et information séparée sur la perte possible du droit après exécution complète, sans suppression des droits légaux. Un calcul au prorata est proposé avant exécution complète ; les situations hors calcul automatique sont orientées vers examen. Aucun traitement humain ou envoi de demande n’est simulé comme accompli. Conditions et confirmation sur support durable restent à valider avant vente. Sources : Service Public, droit de rétractation F10485 ; Code de la consommation, articles L221-18 à L221-28. Les exceptions de service complètement exécuté ne doivent pas être confondues avec une exclusion générale des services numériques.

### Laboratoire Stripe de la nouvelle boutique

La simulation locale reste accessible sans paiement. L’organisateur peut aussi tester chaque référence avec Stripe via `/api/service/shop-test/checkout`, lire les commandes avec `status`, puis `cancel` ou `withdraw` pour une formule test admissible. Le serveur réutilise la clé restreinte de test déjà configurée, sans exposer sa valeur. Aucun nouveau compte Stripe n’est sélectionné via le connecteur : ses comptes accessibles diffèrent du compte de la clé runtime. Le prix mensuel existant est conservé ; l’annuel utilise le même produit Premium avec un prix Checkout annuel de 69,90 €. Les autres produits et prix sont construits à partir du catalogue serveur dans Checkout, jamais à partir d’un montant client. Aucun produit ou ancien prix n’a été supprimé.

Nouvelle migration SQLite `0005_same_vin_gonzales`, table `shop_test_orders`, isolée des droits de production. Idempotence de la création Checkout par commande, contrôle du client, mode test, montant, devise, ligne unique, état payé, échéance et remboursements. Les retours URL ne confirment jamais un achat. Les reçus serveur ajoutent des droits locaux d’essai une seule fois et révoquent les crédits inutilisés lors d’une inversion ; ils n’écrivent jamais `members.premium_until`. Les remboursements de test utilisent une clé d’idempotence stable et bloquent les droits pendant une tentative incomplète. Les commandes sont incluses dans l’export et supprimées de D1 avec le compte ; les objets Stripe restent à traiter séparément.

Le webhook signé existant synchronise aussi les nouvelles commandes lorsqu’il reçoit un événement. Il demeure inaccessible directement depuis Stripe sur ce site privé : sa livraison effective est un prérequis obligatoire avant toute vente ou activation de renouvellement réel. Aucun jeton de contournement n’est introduit. Avant encaissement, il faut aussi valider TVA, éventuelles immatriculations, CGV, confirmations durables, support et traitement des remboursements ; `automatic_tax` n’est pas activé sans enregistrement fiscal validé. Le modèle illimité doit être confronté au coût réel de la vidéo et de la modération avant commercialisation.

### Rencontres physiques

Exclusivement « Bientôt » : partenariats futurs avec bars, cafés et salons. Aucun lieu annoncé, créneau, réservation, billet ou achat partenaire. L’ancienne simulation de second rendez-vous physique/programmé n’est plus accessible dans les offres. Les nouvelles invitations audio/vidéo ne sont pas des réservations dans un établissement.

Validation : tests automatisés Node du modèle, du cycle de permission, des achats et de l’API Stripe simulée ; build Worker et contrôle syntaxique. Les tests de paiement ne remplacent pas un passage humain dans Checkout. La création réelle d’un achat Stripe des nouvelles références, les permissions supplémentaires éventuelles de la clé restreinte, Safari iOS/Chrome Android et la vidéo entre de vrais membres restent à vérifier. Aucun navigateur de contrôle pris en charge n’est disponible ; aucune inspection visuelle ou validation sur téléphone n’est déclarée.

## Photo de profil, arrière-plans et affichage vidéo à deux — 19 octobre 2026

Photo ajoutée depuis Mon profil, avec import JPEG/PNG/WebP (10 Mo source maximum), recadrage tactile/souris, zoom et réglages de position accessibles au clavier. Réencodage JPEG 512 × 512 côté navigateur ; limite serveur de 512 Kio et dimensions bornées, suppression des segments de métadonnées APP/EXIF/ICC et commentaires. Le serveur rejette SVG, formats déclarés incorrects, faux JPEG et corps excessifs ; lecture bornée des flux avant accumulation en mémoire. Remplacement et suppression disponibles. L’avatar du compte, du salon, de l’aperçu audio et des rencontres utilise la photo enregistrée.

Les images et réglages sont enregistrés dans R2 sous des clés dérivées de l’identité authentifiée, séparées du profil d’inscription pour conserver la photo après modification du prénom ou de la ville. Routes propriétaires `/api/me/photo`, `/api/me/background`, `/api/me/media` ; mutations same-origin avec marqueur CSRF, inscription obligatoire, réponses sans cache pour les images personnelles. `/api/profile-photo/<encounter>` n’autorise que le participant de la rencontre en cours ou d’un match réciproque ; refus après blocage/suspension et pour un tiers. Les photos et décors actifs sont supprimés avec le compte. Aucun répertoire public de photos n’est ajouté.

Arrière-plans disponibles en Gratuit et Premium : naturel, flou, Rose Momento, Minuit, Studio lumineux et image personnalisée, recadrée en 1280 × 720 avec limite serveur 1 Mio. Le choix est enregistré sur le compte et sélectionnable avant un salon, un aperçu ou le laboratoire LiveKit. `@livekit/track-processors` 0.8.2 et MediaPipe Tasks Vision 0.10.14 effectuent le traitement local ; aucune API d’inférence payante. Bundle navigateur, fichiers WASM et modèle fournis par le site, intégrés et compressés dans le Worker. Aucune dépendance réseau à Google ou à un CDN pendant les appels. SHA-256 des quatre fichiers JS/WASM et du modèle vérifiés à la compilation ; version de modèle fixée à 1. Aucune URL distante arbitraire ni envoi de caméra aux fournisseurs des assets. CSP limitée à `wasm-unsafe-eval`, sans ajouter JavaScript `unsafe-eval`.

Le premier envoi brut du transformateur est désactivé ; publication LiveKit seulement après initialisation du processeur et vérification de la présence du décor pour le remplacement. Erreur d’effet : arrêt matériel, pas de repli silencieux sur le fond naturel ; l’utilisateur peut choisir explicitement Naturel ou Audio. Échéances, annulation d’autorisation tardive, nettoyage caméra/micro, ressources de traitement et sorties conservent leurs garde-fous. Les effets ne constituent pas une garantie de confidentialité du décor et peuvent produire des artefacts ; compatibilité GPU, performances et rendu nécessitent des essais réels.

Vue vidéo privée commune à la répétition et à LiveKit : interlocuteur principal et miniature locale sur mobile, deux cadres sur grand écran, choix de disposition, image entière/remplissage sans déformation, masquer seulement son aperçu, agrandissement et sortie. Le bouton pour quitter reste dans la vue agrandie. Grilles à colonnes réductibles, tailles fluides, seuils 360/700/900/1900 px, écrans paysage de faible hauteur, hauteur dynamique et zones sûres du téléphone. L’aperçu et le laboratoire sont aussi adaptés. Aucun écran ne requiert que les deux personnes possèdent une caméra.

Validation : 96 tests Node réussis et build Worker réussi, dont accès isolés aux photos, suppression, bornes d’upload, retrait des métadonnées, accès interlocuteur et refus après blocage, assets intégrés sans requête externe, absence de traitement en mode audio, arrêt sur réponse tardive et publication après effet seulement. Contrôle navigateur pris en charge indisponible : aucune inspection visuelle, validation GPU ni essai caméra sur Safari iOS/Chrome Android n’est déclaré effectué. Les sessions réelles restent fermées ; ces changements n’activent aucun paiement réel ni nouvel accès public.


## Identité indépendante de ChatGPT — 20 octobre 2026

La cible autonome est décrite dans `PRODUCTION_AUTH.md`. Le build `build:production` produit un Worker Cloudflare avec Supabase Auth (Google, Apple, Facebook et SMS selon fournisseurs activés), ses assets séparés et les bindings D1/R2 à renseigner. La bêta Sites conserve sa connexion et son audience privées. Aucun réglage de compte externe, nouvelle offre payante ou envoi de SMS n’a été déclenché. Aucun compte Supabase existant n’a été migré ou modifié.

Les cookies de connexion sont HttpOnly, Secure, SameSite=Lax, préfixés `__Host-`. L’API ne rend aucun token au JavaScript. Le serveur vérifie l’identité auprès de Supabase, retire les en-têtes d’identité Sites fournis par un client externe et utilise un UUID défini côté serveur pour les administrateurs. OAuth PKCE, URL de retour fixée, contrôle Origin/CSRF, défi SMS signé et quotas D1 sont implémentés. Les moyens affichés sont filtrés selon leur activation réelle dans le fournisseur.

Activer les connexions exige encore le projet Supabase dédié, les clients Google/Apple/Meta, le fournisseur et la protection anti-abus SMS, ainsi qu’un compte d’hébergement et une URL HTTPS autonomes. Le seul projet Supabase visible ne porte pas le nom Momento : il n’a pas été réutilisé par supposition. La suppression complète de l’identité Auth et le contrôle strict des sessions révoquées restent à traiter avant ouverture publique. Comme tout JWT Supabase, un token d’accès copié peut rester valide jusqu’à son expiration même après révocation du refresh token ; définir une durée adaptée et ajouter un contrôle `session_id` pour les opérations sensibles.

Les salons fictifs, les limites et achats locaux, les paiements réels, l’ordonnanceur vidéo et la modération ne deviennent pas opérationnels par cette intégration. Les tests automatiques simulent les réponses Auth et n’établissent pas qu’une connexion Google réelle ou un SMS réel ait été testé.

## Projet Supabase Momento installé — 20 octobre 2026

Cette mise à jour complète l’état historique ci-dessus. Après remplacement de l’autorisation du plugin par le propriétaire, l’accès à l’organisation Momento `ihyvwxutvbldkgsomhcp` est vérifié. Le projet dédié `yhtngbkjqffkhfjadjzp` est créé en Free à Paris (`eu-west-3`), état `ACTIVE_HEALTHY`. La migration `20261020075203_initial_momento_schema` est appliquée et archivée ; 27 tables avec RLS et sept thèmes sont installés. Aucun autre projet Supabase n’a été modifié.

Les tests SQL de propriété, quotas, Premium, crédits, capacité, blocage et suspension ont réussi sur PostgreSQL distant avec fixtures synthétiques et transaction annulée. Le contrôle suivant retrouve zéro compte Auth/profil/salon, sept thèmes et les admissions désactivées. La Data API refuse une lecture anonyme des profils (HTTP 401 / 42501). Les advisors base n’ont renvoyé que des informations : cinq tables privées volontairement sans politique membre et 26 index encore inutilisés sur la base neuve. Voir [SUPABASE_SETUP.md](SUPABASE_SETUP.md) pour les preuves et les liens de diagnostic.

L’URL Supabase, la clé publiable moderne et un secret aléatoire de cookies sont enregistrés côté serveur Pages ; les deux dernières variables sont chiffrées. Aucun secret n’est ajouté au dépôt et aucune clé d’administration n’est configurée. Le suivi quotidien autorisé utilise désormais ce projet Momento.

Google reste désactivé dans Supabase. L’e-mail est actif avec confirmation côté Supabase, mais le SMTP et les redirections doivent être finalisés ; les parcours e-mail/SMS restent désactivés dans Momento. Les API métier, médias et compteurs Auth restent liés aux adaptateurs D1/R2 non configurés sur Pages : le portage Postgres/Storage est à réaliser. Aucune connexion réelle, livraison SMTP, session vidéo ou vente n’est validée par l’installation de la base. Les rencontres publiques restent fermées.
