# Momento — passage en production

État vérifié le **20 octobre 2026**. Ce document est la liste courante des travaux ; `LAUNCH_READINESS.md` conserve aussi l’historique du prototype et de ses anciens modèles commerciaux. Un élément préparé dans le code n’est pas considéré comme opérationnel tant que sa configuration et son fonctionnement réel n’ont pas été vérifiés.

## Ce qui fonctionne déjà

- Dépôt de référence `TbhX/momento`, branche `main`, et hébergement autonome [Cloudflare Pages](https://momento-7se.pages.dev/), sans obligation de compte ChatGPT pour les futurs utilisateurs.
- Build avec tests automatiques ; un push sur `main` a bien déclenché et terminé un déploiement Pages. Le dernier ensemble validé contient 130 tests réussis.
- Interface responsive et PWA installable ; photo, arrière-plans et vue vidéo à deux préparés. Les essais sur appareils et les appels réels restent à faire.
- Adaptateur Supabase Auth serveur pour OAuth, e-mail/mot de passe et SMS conditionnel ; cookies HttpOnly, contrôle d’origine et retrait des en-têtes d’identité falsifiables. Inscription, confirmation/renvoi et récupération sont implémentés ; les fournisseurs réels ne sont pas connectés.
- Projet Supabase dédié Momento créé en Free à Paris ; schéma de 27 tables avec RLS installé, thèmes initialisés et tests SQL réussis à distance. Paramètres de connexion serveur enregistrés dans Pages ; aucun accès métier anonyme.
- Laboratoires Stripe/LiveKit et tests utilisant des fournisseurs simulés. Cela ne valide pas un paiement ou un appel en production.

## État actuel de Supabase

L’autorisation du plugin a été remplacée par le propriétaire et l’accès à l’organisation **Momento** (`ihyvwxutvbldkgsomhcp`) est vérifié. Le projet dédié **Momento**, référence **`yhtngbkjqffkhfjadjzp`**, est créé en Free dans la région Paris `eu-west-3`, avec état `ACTIVE_HEALTHY` vérifié. Aucun autre projet n’a été réutilisé.

La migration **`20261020075203_initial_momento_schema`** est appliquée et archivée dans le dépôt ; sept thèmes sont initialisés. Les tests d’isolation et de quotas ont réussi dans une transaction annulée sur la base distante vide. Les contrôles postérieurs retrouvent zéro compte/profil/salon et les admissions désactivées. Les advisors base n’ont renvoyé que des informations attendues, détaillées dans [SUPABASE_SETUP.md](SUPABASE_SETUP.md). La Data API refuse la lecture anonyme de profils (401 / 42501).

L’URL, la clé publiable moderne et le secret de cookies sont enregistrés côté serveur Pages. **Le portage des API métier reste nécessaire** : le Worker utilise encore D1/R2, sans bindings configurés sur Pages. Google est désactivé dans Supabase ; l’e-mail exige confirmation, mais SMTP, redirections et essais réels restent à finaliser. Les parcours e-mail/SMS restent désactivés dans Momento.

## P0 — avant une bêta avec de vrais membres

| Chantier | Reste à faire | Critère de validation |
| --- | --- | --- |
| Projet Supabase | Socle installé et vérifié ; compléter les tests Data API avec deux vrais comptes Auth après configuration de la connexion | RLS/quotas SQL distants déjà vérifiés ; accès réel entre comptes et services à valider |
| Données persistantes | Raccorder les API métier à Postgres et les médias à un stockage privé ; adapter les identités `supabase:<uuid>` aux UUID | Création, lecture, modification et suppression réellement persistantes ; aucune dépendance D1/R2 non configurée ; pas de fusion de comptes par e-mail |
| Google | Configurer le client OAuth, les secrets et les redirections exactes | Connexion réelle, refus, retour PKCE, expiration et déconnexion testés sur ordinateur et téléphone |
| E-mail et mot de passe | Code et modèles implémentés ; configurer le projet et le SMTP, puis valider les parcours réels avant activation | Confirmation et récupération reçues ; liens expirés/réutilisés refusés ; réponses limitant la divulgation de l’existence d’un compte ; mots de passe et jetons absents des journaux et du stockage navigateur |
| E-mails transactionnels | Configurer l’expéditeur SMTP, les domaines et protections DNS ; préparer les messages de confirmation/récupération | Envoi réel et délivrabilité vérifiés, quotas connus ; aucune dépendance au service de démonstration Supabase pour une ouverture publique |
| Profils et découverte | Raccorder profil, photo, préférences et filtres âge/ville/profession/thèmes aux comptes réels ; définir le contrôle de majorité | Inscription obligatoire ; visibilité maîtrisée ; filtres exécutés côté serveur ; accès aux photos refusé aux tiers et après blocage |
| Salons réels | Remplacer les 19 profils fictifs et l’état local par présence et accès multi-utilisateurs ; finaliser la relation entre salon libre et rotations chronométrées | Maximum de 20 participants, concurrence et reconnexion testées ; temps et capacité décidés par le serveur |
| Quotas et offres | Une entrée gratuite par jour Europe/Paris, sortie définitive pour cette entrée, crédits achetés et Premium actif sans plafond quotidien d’entrées | Aperçu sans consommation ; aucune remise à zéro via le navigateur ; débit unique ; expiration Premium effective ; suppression de la limite historique de cinq sessions lorsqu’elle contredit cette offre |
| Relations | Implémenter les amis, choix privés, matchs, messages et invitations audio/vidéo avec consentement réciproque | Deux comptes réels se retrouvent sur plusieurs appareils ; refus/annulation/blocage appliqués côté serveur ; aucun accès tiers |
| Audio/vidéo | Connecter LiveKit aux salons/échanges réels ; demander uniquement les appareils choisis ; prévoir l’ordonnanceur serveur indépendant des clients | Appel à deux puis charge de 20 participants ; rotation, reconnexion et réseau dégradé ; fin de tour et expulsion après blocage effectives même si le navigateur ne répond plus |
| Administration et modération | Relier les vrais rôles serveur à une interface de gestion ; créer des comptes de test séparés ; traiter signalements et suspensions | Un membre ne peut jamais s’attribuer admin/Premium ; suspension et expulsion effectives ; actions auditées et recours/support définis ; aucun sélecteur de démo donnant des droits réels |
| Sécurité et vie privée | Vérifier RLS/API/stockage, anti-abus et protection des formulaires ; suppression complète de l’identité Auth et révocation des sessions | Tests d’accès entre comptes, contrôle des sessions sensibles, nettoyage des médias ; conservation/purge documentées ; aucune clé serveur dans les assets |
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

- **Connexions retenues : Google et adresse e-mail + mot de passe.** Apple/Facebook sont des possibilités ultérieures, sans priorité sur ce socle.
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

Le projet Supabase est désormais débloqué et installé. Prochaine priorité : raccorder les comptes/profils et les compteurs Auth à Postgres, puis finaliser SMTP/Google et tester les connexions réelles. Le parcours e-mail utilise encore le compteur D1 existant pour les quotas et la consommation des autorisations : cette partie doit être portée avec le backend Postgres.

### Livraison du 20 octobre — base distante et raccordement Pages

Projet Free créé à Paris dans Momento, schéma et fonctions d’entrée/présence installés, sept thèmes initialisés. Migration archivée sous la version exacte attribuée par Supabase. Vérifications locales du schéma et tests SQL distants réussis : propriété, refus d’auto-attribution admin/Premium/crédits, journée Europe/Paris, idempotence, crédit unique, Premium actif/expiré, séparation test/live, capacité, aperçu, blocage et suspension. Les fixtures sont annulées ; aucun membre réel ni salon public n’est ajouté.

Configuration serveur Pages enregistrée, sans clé d’administration : URL, clé publiable moderne et secret aléatoire de cookies. Lecture réelle de l’état Auth : Google désactivé, e-mail avec confirmation, téléphone désactivé. Lecture anonyme de profils via Data API refusée. Ce résultat ne valide ni OAuth ni SMTP ni les API métier actuelles. Le suivi quotidien utilise maintenant ce projet dédié et conserve les mêmes horaires et restrictions.

Validation locale : **130 tests réussis** et build Pages réussi. La suite rejoue maintenant les protections sur deux bases PGlite neuves, l’une issue des schémas déclaratifs, l’autre des migrations versionnées : une migration manquante ou un historique non rejouable ne passe pas inaperçu.

Références : [configuration Supabase](SUPABASE_SETUP.md), [authentification autonome](PRODUCTION_AUTH.md), [historique des validations](LAUNCH_READINESS.md), [e-mail et mot de passe Supabase](https://supabase.com/docs/guides/auth/passwords), [SMTP de production](https://supabase.com/docs/guides/auth/auth-smtp), [permissions Supabase](https://supabase.com/docs/guides/platform/personal-access-tokens).
