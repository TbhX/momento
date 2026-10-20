# Momento — passage en production

État vérifié le **20 octobre 2026**. Ce document est la liste courante des travaux ; `LAUNCH_READINESS.md` conserve aussi l’historique du prototype et de ses anciens modèles commerciaux. Un élément préparé dans le code n’est pas considéré comme opérationnel tant que sa configuration et son fonctionnement réel n’ont pas été vérifiés.

## Ce qui fonctionne déjà

- Dépôt de référence `TbhX/momento`, branche `main`, et hébergement autonome [Cloudflare Pages](https://momento-7se.pages.dev/), sans obligation de compte ChatGPT pour les futurs utilisateurs.
- Build avec tests automatiques ; un push sur `main` a bien déclenché et terminé un déploiement Pages. Le dernier ensemble validé contient 148 tests réussis.
- Interface responsive et PWA installable ; photo, arrière-plans et vue vidéo à deux préparés. Les essais sur appareils et les appels réels restent à faire.
- Adaptateur Supabase Auth serveur pour OAuth, e-mail/mot de passe et SMS conditionnel ; cookies HttpOnly, contrôle d’origine et retrait des en-têtes d’identité falsifiables. Inscription, confirmation/renvoi et récupération sont implémentés ; les fournisseurs réels ne sont pas connectés.
- Projet Supabase dédié Momento créé en Free à Paris ; schéma de 27 tables avec RLS installé, thèmes initialisés et tests SQL réussis à distance. Paramètres de connexion serveur enregistrés dans Pages ; aucun accès métier anonyme.
- Laboratoires Stripe/LiveKit et tests utilisant des fournisseurs simulés. Cela ne valide pas un paiement ou un appel en production.

## État actuel de Supabase

L’autorisation du plugin a été remplacée par le propriétaire et l’accès à l’organisation **Momento** (`ihyvwxutvbldkgsomhcp`) est vérifié. Le projet dédié **Momento**, référence **`yhtngbkjqffkhfjadjzp`**, est créé en Free dans la région Paris `eu-west-3`, avec état `ACTIVE_HEALTHY` vérifié. Aucun autre projet n’a été réutilisé.

Trois migrations sont appliquées et archivées : **`20261020075203_initial_momento_schema`**, **`20261020113549_accounts_storage_and_session_guards`** et **`20261020121744_serve_private_media_through_authenticated_app`**. Sept thèmes sont initialisés. Les tests SQL d’isolation et de quotas ont réussi avec rollback. Le Worker compilé a aussi réussi un essai contre les vrais services Auth/Postgres/Storage avec deux comptes jetables, puis leur suppression complète. Le contrôle final retrouve zéro compte/profil/objet média, 27 tables avec RLS et les admissions désactivées. Le contrôle de session protège les JWT révoqués ; les médias passent exclusivement par le Worker.

L’URL, les clés modernes publiable/serveur et le secret de cookies sont enregistrés côté serveur Pages ; `SUPABASE_DATA_ENABLED=true`. **Les comptes/profils, médias et compteurs Auth sont portés**. Les autres services restent fermés sur Pages. Les deux retours Auth exacts sont enregistrés. Google reste désactivé : client absent et console inaccessible dans cette session. Le propriétaire n’a pas encore de domaine d’expéditeur ; aucun SMTP de production n’est vérifié. Les parcours e-mail/SMS restent désactivés dans Momento. L’avis Auth sur les mots de passe compromis reste ouvert : la fonction Supabase exige Pro ou plus ; aucun abonnement n’est souscrit. Détails dans [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## P0 — avant une bêta avec de vrais membres

| Chantier | Reste à faire | Critère de validation |
| --- | --- | --- |
| Projet Supabase | Socle et comptes vérifiés sur les vrais services ; valider les parcours fournisseurs et appareils | Isolation entre deux comptes Auth, révocation et suppression déjà testées ; Google, SMTP et parcours mobiles à valider |
| Données persistantes | Comptes/profils et médias portés ; poursuivre les salons, relations et paiements | Création, lecture, modification et suppression réellement persistantes ; aucune dépendance D1/R2 non configurée ; pas de fusion de comptes par e-mail |
| Google | Configurer le client OAuth, les secrets et les redirections exactes | Connexion réelle, refus, retour PKCE, expiration et déconnexion testés sur ordinateur et téléphone |
| E-mail et mot de passe | Code, modèles et retours configurés ; obtenir un domaine d’expéditeur, configurer SMTP et protections natives, puis valider les parcours réels avant activation | Confirmation et récupération reçues ; liens expirés/réutilisés refusés ; réponses limitant la divulgation de l’existence d’un compte ; mots de passe et jetons absents des journaux et du stockage navigateur |
| E-mails transactionnels | Configurer l’expéditeur SMTP, les domaines et protections DNS ; préparer les messages de confirmation/récupération | Envoi réel et délivrabilité vérifiés, quotas connus ; aucune dépendance au service de démonstration Supabase pour une ouverture publique |
| Profils et découverte | Profil de base et images persistants ; porter les préférences et filtres de découverte, définir le contrôle de majorité | Inscription obligatoire ; visibilité maîtrisée ; filtres exécutés côté serveur ; accès aux photos refusé aux tiers et après blocage |
| Salons réels | Remplacer les 19 profils fictifs et l’état local par présence et accès multi-utilisateurs ; finaliser la relation entre salon libre et rotations chronométrées | Maximum de 20 participants, concurrence et reconnexion testées ; temps et capacité décidés par le serveur |
| Quotas et offres | Une entrée gratuite par jour Europe/Paris, sortie définitive pour cette entrée, crédits achetés et Premium actif sans plafond quotidien d’entrées | Aperçu sans consommation ; aucune remise à zéro via le navigateur ; débit unique ; expiration Premium effective ; suppression de la limite historique de cinq sessions lorsqu’elle contredit cette offre |
| Relations | Implémenter les amis, choix privés, matchs, messages et invitations audio/vidéo avec consentement réciproque | Deux comptes réels se retrouvent sur plusieurs appareils ; refus/annulation/blocage appliqués côté serveur ; aucun accès tiers |
| Audio/vidéo | Connecter LiveKit aux salons/échanges réels ; demander uniquement les appareils choisis ; prévoir l’ordonnanceur serveur indépendant des clients | Appel à deux puis charge de 20 participants ; rotation, reconnexion et réseau dégradé ; fin de tour et expulsion après blocage effectives même si le navigateur ne répond plus |
| Administration et modération | Relier les vrais rôles serveur à une interface de gestion ; créer des comptes de test séparés ; traiter signalements et suspensions | Un membre ne peut jamais s’attribuer admin/Premium ; suspension et expulsion effectives ; actions auditées et recours/support définis ; aucun sélecteur de démo donnant des droits réels |
| Sécurité et vie privée | Contrôles de session, compteurs, RLS et suppression Auth implémentés ; compléter anti-robots fournisseur, purge et protection des mots de passe compatible Free | Tests d’accès entre comptes, contrôle des sessions sensibles, nettoyage des médias ; conservation/purge documentées ; aucune clé serveur dans les assets |
| Validation mobile et exploitation | Tester les parcours de bout en bout ; ajouter supervision, alertes utiles, sauvegardes et procédure de restauration | Safari iOS et Chrome Android réels ; clavier/lecteur d’écran, petits/grands écrans, caméra refusée ; restauration testée et erreurs observables sans données sensibles |
| Informations publiques | Publier l’identité de l’exploitant, contact réel, règles de communauté, confidentialité et CGU ; revue juridique adaptée | Documents cohérents avec les traitements et les fournisseurs réellement utilisés ; demandes de sécurité/confidentialité prises en charge |

Les nouvelles fonctions doivent être essayées dans un environnement et avec des comptes de test séparés. Les rencontres publiques restent fermées pendant cette mise en place. La présence d’un booléen d’activation ne constitue pas une validation de lancement.

## P0 — avant toute vente réelle

| Chantier | Reste à faire | Critère de validation |
| --- | --- | --- |
| Catalogue et économie | Confirmer mensuel/annuel/semaine découverte, crédits, prix et coût vidéo/modération/support | Offre identique quel que soit le genre, prix et droits cohérents sur tous les écrans ; coût et marge estimés avec les limites réelles des fournisseurs |
| Stripe | Connecter les bons prix du même compte et environnement, checkout, portail et webhook signé sur l’origine autonome | Achat test complet jusqu’au droit serveur ; rejeux/doublons sans double crédit ; annulation, échec, expiration et remboursement testés |
| Droits payants | Remplacer les reçus et droits locaux de répétition par un journal et des transactions serveur | Le retour Checkout ou une modification du navigateur n’accorde rien ; Premium/crédits sont accordés et retirés selon l’état vérifié du paiement |
| Conditions commerciales | Finaliser CGV, factures, taxes applicables, résiliation, remboursement et présentation de la semaine découverte | Garantie commerciale de 15 jours et droits légaux présentés distinctement ; maintien jusqu’à l’échéance après résiliation ; confirmation durable et support opérationnel |

Les ventes réelles sont désactivées. `readiness.payments` vaut encore `false` dans le serveur ; il ne suffit pas de changer ce drapeau pour terminer l’intégration.

## Choix de connexion et deuxième étape

- **Choix courant : adresse e-mail + mot de passe simples.** Google est reporté. Le mode sans confirmation est préparé mais attend l’accord explicite du propriétaire avant réglage Supabase et activation ; aucune récupération par e-mail n’est disponible sans SMTP. Le parcours avec confirmation/récupération reste prévu pour plus tard.
- **SMS conditionnel uniquement** : il reste désactivé tant qu’une solution réellement gratuite et adaptée à la production n’a pas été établie. Aucune offre d’essai n’est assimilée à un service gratuit permanent, aucun abonnement ni SMS payant n’est activé.
- **Applications iPhone/Android** : après validation du site, préparer le paquet applicatif, les comptes développeur, la politique de confidentialité, les parcours de suppression et les exigences actuelles d’authentification/achats des stores. Une PWA installable n’est pas une application déjà publiée sur les stores.
- **Rencontres physiques** : conserver exclusivement le teaser « Bientôt ». Aucun partenaire, lieu, créneau ou achat avant la mise en place réelle des partenariats.
- Un domaine propre et une adresse d’expéditeur cohérente sont souhaitables pour le lancement commercial. L’origine définitive devra être répercutée dans Auth, Stripe et la configuration serveur.

## Exécution quotidienne

Une tâche est activée à partir du **21 octobre 2026**, chaque matin **vers 8 h, Europe/Paris**. Elle doit traiter un chantier réalisable, lire les sources actuelles, exécuter les vérifications, pousser les changements validés et contrôler le déploiement Pages. Aucun push n’est requis lorsqu’il n’existe pas de changement utile et vérifié.

Le propriétaire autorise les mises à jour et push de routine sans nouvelle demande. Les abonnements payants, suppressions d’infrastructure/données et mises en service non validées ne font pas partie de cette autorisation. Le périmètre vérifié couvre GitHub, Cloudflare et **uniquement le projet Supabase dédié Momento** identifié ci-dessus. La tâche a été actualisée après vérification des trois accès. Chaque exécution consigne le changement, ses vérifications et les blocages réels ; elle ne promet pas une date de production tant que les dépendances externes ne sont pas résolues.

### Livraison du 20 octobre — e-mail et mot de passe

Parcours serveur et interface livrés : inscription, confirmation, renvoi de confirmation, connexion, demande de récupération et changement du mot de passe. Modèles e-mail français fournis. Activation explicite, confirmation d’adresse obligatoire, quotas d’envoi et de connexion, PKCE lié au navigateur, autorisation de récupération signée et liée à l’identité/session, consommation unique même en concurrence. Une modification de mot de passe demande la révocation des sessions de rafraîchissement et efface les cookies locaux ; l’interface indique si cette révocation n’a pas pu être confirmée. Les JWT déjà copiés restent à traiter par le contrôle strict des sessions avant lancement.

Validation locale : **129 tests réussis**, dont 21 nouveaux tests serveur/DOM, et build Pages. Aucun compte Auth ni envoi SMTP réel n’a été créé pour ces tests. La nouvelle dépendance de test `jsdom` est fixée à 26.1.0 et ne fait pas partie du bundle livré aux utilisateurs. Les contrôles sur appareils et l’envoi réel restent à faire.

À cette étape historique, les comptes utilisaient encore les adaptateurs D1/R2. Leur portage et les preuves réelles sont consignés dans la livraison suivante.

### Livraison du 20 octobre — base distante et raccordement Pages

Projet Free créé à Paris dans Momento, schéma et fonctions d’entrée/présence installés, sept thèmes initialisés. Migration archivée sous la version exacte attribuée par Supabase. Vérifications locales du schéma et tests SQL distants réussis : propriété, refus d’auto-attribution admin/Premium/crédits, journée Europe/Paris, idempotence, crédit unique, Premium actif/expiré, séparation test/live, capacité, aperçu, blocage et suspension. Les fixtures sont annulées ; aucun membre réel ni salon public n’est ajouté.

Configuration serveur Pages enregistrée, sans clé d’administration : URL, clé publiable moderne et secret aléatoire de cookies. Lecture réelle de l’état Auth : Google désactivé, e-mail avec confirmation, téléphone désactivé. Lecture anonyme de profils via Data API refusée. Ce résultat ne valide ni OAuth ni SMTP ni les API métier actuelles. Le suivi quotidien utilise maintenant ce projet dédié et conserve les mêmes horaires et restrictions.

Validation locale : **130 tests réussis** et build Pages réussi. La suite rejoue maintenant les protections sur deux bases PGlite neuves, l’une issue des schémas déclaratifs, l’autre des migrations versionnées : une migration manquante ou un historique non rejouable ne passe pas inaperçu.

Références : [configuration Supabase](SUPABASE_SETUP.md), [authentification autonome](PRODUCTION_AUTH.md), [historique des validations](LAUNCH_READINESS.md), [e-mail et mot de passe Supabase](https://supabase.com/docs/guides/auth/passwords), [SMTP de production](https://supabase.com/docs/guides/auth/auth-smtp), [permissions Supabase](https://supabase.com/docs/guides/platform/personal-access-tokens).

### Livraison du 20 octobre — comptes et médias privés opérationnels sur Supabase

Les routes de compte utilisent maintenant Postgres et le bucket privé `momento-media` : inscription du profil et consentement, lecture/modification, photo, décor vidéo, export et suppression complète de l’identité Auth. Les compteurs anti-abus et autorisations de récupération sont atomiques côté Postgres. Les rôles proviennent des tables serveur, sans privilège issu de métadonnées utilisateur. La révocation est contrôlée par le Worker et les politiques/RPC de données ; les images sont servies uniquement après autorisation par le Worker, sans cache ni accès membre direct à Storage.

Les deux migrations de compte et de médias ont été appliquées sous les versions réellement attribuées par Supabase, après tests de l’état déclaratif et du rejeu. La configuration Pages active le backend Supabase et chiffre la clé serveur ; les 13 variables précédentes ont été préservées, soit 15 variables au total. Les retours de connexion et récupération exacts sont enregistrés, sans wildcard.

Validation locale : **139 tests réussis** et **build Pages réussi**. Les deux scripts SQL d’accès/comptes ont réussi sur PostgreSQL distant avec rollback. Le vérificateur explicite a ensuite réussi les **sept contrôles contre les vraies API**, en exécutant le Worker compilé localement : connexion de deux identités jetables confirmées administrativement, profils persistants et isolés, JPEG privé, décor persistant, export isolé, refus après révocation via Worker/Data API/Storage et suppression complète profil/médias/Auth. Aucun e-mail ni SMS n’a été envoyé. Le nettoyage a été confirmé séparément par lecture SQL : zéro identité Auth, profil ou objet média ; admissions toujours fermées. Cela ne constitue pas une validation HTTP du déploiement Cloudflare, d’OAuth Google, de SMTP ou d’un téléphone réel.

Les advisors ne signalent pas d’erreur de schéma ; les remarques RLS privées et index inutilisés restent informatives. L’avertissement Auth de protection contre les mots de passe compromis est documenté et demande une décision compatible avec Free avant ouverture du mot de passe au public. Google reste sans identifiants ; SMTP attend un domaine d’expéditeur. Les autres API métier répondent explicitement que la fonction n’est pas prête. Prochaine priorité réalisable : salons et relations persistants, tout en conservant les inscriptions publiques, la vidéo réelle et les ventes fermées jusqu’à validation.

### Livraison du 20 octobre — mode e-mail et mot de passe simple préparé

À la demande du propriétaire, un mode `basic` est ajouté sans dépendance à SMTP ni Google : inscription immédiate avec mot de passe, session HttpOnly puis profil. Il annonce une adresse non vérifiée et l’absence de récupération par e-mail. Les liens de récupération et renvoi sont refusés dans ce mode, y compris côté API. Le client temporaire d’inscription utilise la clé publiable, sans PKCE/persistance ni retour OAuth ; le client SSR reprend la session et vérifie l’identité. Quotas, mot de passe fort, CSRF, contrôle des sessions et RLS sont conservés. Les comptes existants ne reçoivent aucun droit issu de leur e-mail.

Validation : **144 tests locaux réussis** et build Pages réussi. Cinq nouveaux tests couvrent cohérence avec le réglage Supabase, inscription sans flux e-mail, cookies et identité vérifiée auprès d’Auth, reconnexion, refus de session invalide, liens inactifs, quotas, et message exact dans le formulaire. Aucun essai réel du nouveau mode n’a été effectué : Supabase exige encore la confirmation, `AUTH_EMAIL_ENABLED=false`. La confirmation explicite du propriétaire est attendue avant désactivation de la vérification d’adresse dans le tableau de bord, puis activation et test jetable. Aucune promesse de récupération de mot de passe n’est affichée. Les salons et ventes réels restent fermés.

### Livraison du 20 octobre — accueil public et pages harmonisées

Nouvel accueil : concept, thèmes, formules reliées au catalogue de la boutique, FAQ, version mobile et teaser physique. La page est accessible aux visiteurs ; salons, amis, invitations, boutique et profil restent derrière l’inscription obligatoire. Navigation commune, titres et liens internes, états vides, profil, confidentialité et page introuvable harmonisés. Les portraits illustratifs sont locaux, sans appel d’image externe ni prétendu membre réel. L’ancien audit public et ses offres périmées sont remplacés par un état de préparation exact. Les API métier non raccordées ne sont plus proposées comme des services actifs : leurs pages décrivent la suite prévue.

Validation : **148 tests réussis** et build Pages réussi. Quatre tests de parcours DOM vérifient accueil anonyme, refus des accès membre sans profil complet, pages publiques d’information, noms échappés et absence d’appel aux services encore fermés. Contrôle visuel et navigation effectués dans le navigateur sur un aperçu isolé avec API et identité synthétiques : accueil, inscription e-mail, salons, liens, invitations, boutique et profil. Ce serveur d’essai n’est pas livré. Les essais ne valident ni inscription Supabase réelle, ni caméra, paiement, mobile physique ou HTTP de bout en bout sur Pages. Les media queries sont préparées pour petits et grands écrans ; Safari iOS et Chrome Android réels restent à essayer.

Aucun réglage Supabase, secret, rôle ou paiement n’est modifié par cette livraison. L’e-mail reste désactivé jusqu’à la confirmation explicite attendue ; les rencontres et ventes réelles restent fermées.
