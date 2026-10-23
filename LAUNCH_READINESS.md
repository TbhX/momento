# État de préparation de Momento

Cette livraison remplace la grande fenêtre par un petit encart dans la vidéo et explicite la prise en charge des prolongations par leur demandeur. Les appareils se testent sur action explicite ; les profils distants et achats restent fictifs. Le menu latéral, le tiroir mobile et les palettes pastel sont conservés.

## Vérifié localement

- 234 tests et build Pages réussis.
- Prolongation envoyée ou reçue : seul le demandeur utilise un accès après acceptation, jamais l’invité ; aucun achat fictif avant sa réponse.
- Refus, annulation, expiration, ancien jeton, réponse répétée et solde insuffisant ne créent aucun débit incorrect ni prolongation partielle.
- Coût figé au moment de l’autorisation ; aucun achat plus cher si le tarif augmente, aucun achat automatique si un accès prépayé disparaît.
- Encart sans modale ni vol de focus : appareils accessibles, fermeture par Échap, retour au bouton et défilement du panneau sans déclencher de swipe.
- Rappel à 60 secondes, encart à 30 secondes et compteur de décision distinct ; après masquage, réouverture manuelle depuis « Mes choix ».
- Une confirmation en cours reste visible. Masquer une prolongation laisse la demande en attente jusqu’à annulation explicite ou expiration ; fermer un formulaire d’ajout ami annule sa demande. Une confirmation tardive ne crée ni achat fictif ni action pour une autre personne.
- Focus stable pendant le décompte, fermeture du panneau sans perdre la disposition vidéo, retour d’onglet masqué sans alerte périmée et reprise après un échange privé terminé.
- Coût affiché selon le solde Gratuit ou Premium d’essai ; aucune proposition payante avant le match réciproque.
- Aperçu membre avec appareils éteints, autorisations séparées, arrêt/réactivation et libération après navigation, y compris pour une autorisation tardive.
- Tours de 5 minutes, choix de 30 secondes, deux likes, consentements explicites et présence pour un échange privé.
- Refus, blocages, annulation, expiration, absence de crédit et répétition de confirmation sans double consommation ; un même accès couvre lien ami et échange privé de 3 minutes, puis un second rendez-vous nécessite un autre accès.
- Swipe horizontal sans intercepter le défilement vertical, accès réservé au profil complété et aucune API de service appelée par l’illustration publique.
- Clics rapides, réponses tardives, erreurs de chargement et retour arrière avec restauration du défilement interne.
- Menu mobile au clavier : ouverture, boucle de focus, fermeture par Échap ou navigation.
- Transitions immédiates, annulables et désactivées selon la préférence de réduction des animations.
- Requêtes membre parallèles, partage limité aux GET en cours, invalidation après écriture et changement de compte ; aucune réponse privée terminée en cache.
- Module vidéo absent du chargement initial, requête partagée, reprise après erreur et abandon sans ouverture de salle après navigation.
- Protection des comptes, sessions, profils, quotas, rôles administrateur et accès entre comptes conservée par la suite de tests.
- Palettes automatiques selon le genre déclaré, choix manuel séparé par compte, retour au mélange visiteur à la déconnexion et gestion du stockage indisponible.
- Modification facultative du genre limitée au profil actif connecté, avec rejet des valeurs et champs étrangers ; aucune nouvelle colonne ni privilège.
- Confidentialité intégrée à l’application, avec document complet accessible séparément.

Le cadre fixe publié a été observé dans un navigateur de bureau : accueil sans défilement à la taille contrôlée, concept, formules, formulaire d’inscription, confidentialité longue avec défilement interne et retour arrière. Le module de conférence est absent du chargement initial.

L’aperçu local est inaccessible au navigateur dans cet environnement. La colonne de genre facultatif et ses droits existants ont été vérifiés par lecture du schéma distant, sans modifier de profil réel. Les palettes publiées ont été contrôlées séparément dans le navigateur. Le contrôle du nouveau panneau de prolongation et de ses deux rôles publics est consigné dans le suivi privé. Les simulations et tests isolés ne constituent pas un essai sur smartphone ou un appel réel à deux appareils.

## Acquis des livraisons précédentes

Comptes e-mail/mot de passe pilotés par Supabase Auth, profils et images privés, catalogue et relations persistants, administration et historique. Les inscriptions suivent les réglages du service ; l’adresse n’est pas vérifiée et la récupération par e-mail n’est pas disponible. Google et SMS restent reportés.

Les vérifications de l’authentification, de l’activation administrateur et des API distantes des livraisons précédentes sont distinctes de la vérification visuelle de cette livraison. Les simulations Gratuit/Premium n’accordent aucun droit payant.

## À terminer avant les rencontres publiques

Connexion réelle de deux participants et rotations côté serveur, matchs et droits de connexion persistants avec débits atomiques, gestion complète des salons et traitement opérationnel des signalements, choix réciproques et messages, pagination, essais iOS/Android, exploitation et restauration, informations publiques de l’exploitant et revue des conditions.

Le parcours guidé fonctionne en local et n’applique pas son tarif aux relations persistantes existantes. Les ventes et droits payants exigent leur validation distincte. Les rencontres physiques restent un teaser. Une PWA installable ne signifie pas que les applications sont publiées sur les stores. Les identifiants et détails d’exploitation ne sont pas documentés dans ce dépôt public.
