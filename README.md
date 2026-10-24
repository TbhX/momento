# Momento

Application de rencontres audio/vidéo pensée pour le mobile et utilisable sur ordinateur. Les comptes Momento sont indépendants ; aucun compte ChatGPT ou Cloudflare n’est demandé aux utilisateurs.

## Salons personnalisables et capacité visée

Le créateur public donne un aperçu d’une soirée de 20, 50 ou 100 places. Après inscription et profil complet, un membre peut enregistrer et modifier ses brouillons. La publication ordinaire, encore fermée, contrôle côté serveur les crédits de création ou l’avantage Premium : une création de 20 places tous les 30 jours. Les formats de 50 et 100 utilisent respectivement deux et quatre crédits. Le lien social n’expose que les informations du salon ; les réservations sont confirmées par paires femmes/hommes et l’excédent attend son tour. Une annulation avant le départ rétablit une seule fois les crédits utilisés.

Le catalogue et les liens personnels sont recherchés côté serveur par pages de 12 éléments, avec curseurs et limites de lecture. L’objectif est de préparer 1 000–5 000 actifs mensuels ; le dimensionnement des appels simultanés reste à valider. Les rencontres réelles, la publication ordinaire et les achats sont fermés. Voir [les tarifs, hypothèses de coûts et validations restantes](PRICING_AND_CAPACITY.md).

## Interface

L’application utilise un cadre fixe avec menu latéral et vues centrales. Sur mobile, le menu devient un tiroir accessible au clavier. Les formulaires et listes longs défilent dans leur panneau, sans déplacer le cadre. L’accueil, le concept, les formules et la confidentialité s’ouvrent dans la même application, avec liens directs et retour arrière.

Les transitions rosées respectent la réduction des animations. Les lectures des espaces membre sont parallélisées et seules les requêtes GET encore en cours sont partagées. Aucune réponse privée terminée n’est mise en cache. Le module de conférence est chargé à la demande pour un appel ou un effet vidéo.

Les visiteurs voient un mélange rose et bleu pastel. Dans « Mon profil », le genre facultatif règle la palette automatique : rose pour une femme, bleu pour un homme, mélange pour les autres choix. Chacun peut préférer une autre ambiance. Le genre est enregistré sur le compte ; le choix manuel de couleur reste sur cet appareil, séparé par compte. La déconnexion remet immédiatement le mélange visiteur.

## Tête-à-tête audio et vidéo

Le menu « Essayer un appel » ouvre une répétition guidée, après inscription et profil complété. Caméra et micro restent éteints avant un choix explicite et se règlent séparément. Les vues côte à côte, verticale et avec miniature permettent de préparer son cadrage. Quitter arrête les appareils ; une autorisation tardive ne relance pas un aperçu fermé. Une illustration publique est visible dans « Le concept ».

Les profils de cet essai sont fictifs : tours de 5 minutes, choix pendant 30 secondes, likes privés, match après deux oui et swipe gratuit. Après un match, la prolongation demande un coût confirmé par le demandeur puis l’acceptation de l’invité. Un accès privé à 1,90 € débloque le lien ami et un échange privé de 3 minutes avec la même personne, en quittant la rotation. Un second rendez-vous de 15 minutes utilise un nouvel accès. Premium inclut ces options dans la simulation ; accepter ne fait pas payer le destinataire. Aucun achat ni appel réel n’est effectué.

À 60 secondes de la fin, un rappel discret apparaît. À 30 secondes, un petit encart s’ouvre dans la vidéo, sans voile ni blocage du micro, de la caméra ou de la navigation. Il ne prend pas le focus automatiquement. « Mes choix » permet de le rouvrir après l’avoir masqué. Les 30 secondes de décision disposent de leur propre compteur. Les autres options sont repliées pour alléger l’écran.

Pour prolonger, le demandeur confirme « Envoyer » avec son coût conditionnel : un accès de son solde, un achat fictif à 1,90 € si son solde est vide, ou une option incluse. L’invité peut accepter gratuitement ou refuser. Seul le demandeur utilise son accès, uniquement après acceptation ; aucun achat fictif n’est créé pendant l’attente, après refus, annulation ou expiration. La réponse expire sous 30 secondes, au plus tard à la rotation. Le chrono du tour n’est pas suspendu.

Masquer l’encart conserve une invitation en attente ; « Annuler la demande » la retire. Une confirmation répétée ne consomme pas deux fois et un tarif plus élevé ou un avantage expiré exigent une nouvelle autorisation. Les contrôles de démonstration permettent d’essayer une demande envoyée ou reçue. L’exemple public montre les deux côtés sans ouvrir d’appareil ni créer de compte.

Ces règles sont testables localement. Un socle serveur distinct conserve les votes réciproques, l’autorisation du demandeur, l’acceptation et un accès privé de trois minutes. Il peut consommer un crédit prépayé du demandeur de façon atomique ; le destinataire n’est jamais débité. Il reste désactivé. Le raccordement du parcours aux appels réels et le paiement bancaire conditionnel restent à intégrer avant ouverture.

## Comptes et fonctionnalités

Supabase Auth gère les comptes par e-mail et mot de passe. Le site suit les réglages natifs d’activation et d’inscription ; fermer les nouveaux comptes laisse les membres existants se connecter. L’adresse n’est pas vérifiée et la récupération par e-mail n’est pas encore disponible. Le formulaire annonce ces limites. Google et SMS sont reportés.

Les profils, médias privés, catalogue, amis, invitations, blocages et signalements disposent de données persistantes. L’administration propose compteurs, signalements paginés, traitement, suspension/rétablissement et historique. Les tests Gratuit/Premium restent des simulations, sans abonnement réel.

Les appels réels, rotations, messages, gestion complète des salons, exploitation et paiements restent à finaliser. Les rencontres publiques et les ventes restent fermées. Le physique reste un aperçu futur. La web-app installable n’est pas encore publiée sur les stores.

## Tests de l’administrateur

Dans Administration, « Admin illimité · Gratuit » et « Admin illimité · Premium » ouvrent un laboratoire local avec entrées et crédits d’essai illimités. Le serveur relit le rôle administrateur avant l’ouverture ; un modérateur ou un compte ordinaire ne peut pas activer ce parcours. Le choix Premium est modifiable dans la console de répétition. Les profils Gratuit/Premium habituels restent disponibles pour vérifier leurs limites normales.

L’indicateur illimité n’est pas conservé dans le stockage local et disparaît à la déconnexion ou au changement de profil de test. Aucun crédit réel, abonnement, paiement ou accès à un autre membre n’est accordé. Match réciproque, consentement, refus, expiration, blocage et autorisations d’appareils gardent leurs contrôles. Les créations de salons peuvent être préparées en brouillon. Un administrateur activé peut ensuite publier gratuitement un **salon de test par lien**, sans crédit réel ni accès à un appel distant. Les publications ordinaires, rencontres réelles et ventes restent fermées.

## Développement

Node.js 22 minimum et pnpm selon la version verrouillée dans `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build:pages
```

Le build produit `pages-dist` avec le site et son Worker. Les paramètres sensibles restent dans les services ; aucun secret ou export personnel ne doit être ajouté au dépôt.

331 tests locaux et build Pages réussis pour cette livraison. Ils couvrent notamment la navigation, les accès entre comptes, les palettes, les appareils et autorisations tardives, les consentements, les chronos, les blocages et la protection contre les confirmations répétées sans double consommation d’accès. Les scénarios serveur de prolongation sont rejoués sur le schéma déclaré et sur les migrations, dans des bases de test isolées. La validation du code publié et les essais sur appareils sont suivis séparément dans [LAUNCH_READINESS.md](LAUNCH_READINESS.md).

Voir aussi [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md) et [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md). Les détails d’exploitation sont conservés dans le suivi privé.

### Table ronde

Le menu « La table ronde » présente un aperçu sans permission d’appareil. Après inscription et profil complet, la répétition combine places paginées, filtre de genre déclaré, choix d’une personne, chrono de 5 minutes et 30 secondes, like, swipe et demandes consenties de prolongation. Un seul tête-à-tête reste au centre. Les personnes sont fictives ; seul l’aperçu de vos appareils peut être réel. Le quota d’entrée et les crédits de cette répétition sont locaux, distincts des droits serveur.
