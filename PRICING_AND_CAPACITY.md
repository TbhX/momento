# Momento — tarifs et capacité

Décisions du 24 octobre 2026. Prix proposés TTC, achats et rencontres réelles encore fermés. Cette analyse établit un positionnement et des hypothèses ; elle ne démontre pas une rentabilité ou une tenue en charge.

## Repères observés

| Offre officielle consultée | Prix affiché | Ce que l’on compare |
| --- | --- | --- |
| LeSpeedDating, vidéo Paris / Toulouse | 19 € / 24 € par personne | Soirées organisées, avec une durée et une animation différentes de Momento |
| Affinities, présentiel | À partir d’environ 30 € par personne | Animation, lieu et premier verre ; le présentiel reste un teaser chez Momento |
| SpeedMatchApp Standard | 100 $ par mois | Logiciel pour organisateurs ; plusieurs compteurs de participants, pas un billet consommateur |

Les pages d’événement de LeSpeedDating changent de date ; les versions consultées ne donnent pas toujours la même occurrence. Ces montants sont des prix affichés sur ces pages, pas la preuve d’une séance future encore réservable. Aucun « prix moyen du marché » n’est déduit de ces quelques références. Les abonnements personnalisés des grandes applications de rencontre ne fournissent pas un tarif universel vérifiable.

Sources primaires : [LeSpeedDating Paris](https://www.lespeeddating.com/en/home/705-rencontres-idf-envideo-visiodating-celibataires-soirees-enligne-iledefrance-regionparisienne.html), [LeSpeedDating Toulouse](https://www.lespeeddating.com/en/home/682-rencontres-envideo-celibs-toulouse-midi-celibataires-soirees-enligne-pyrenees.html), [Affinities](https://www.affinities.co/nos-formats-de-rencontre/speed-dating), [SpeedMatchApp](https://speedmatchapp.com/pricing/).

## Grille retenue

| Offre | Prix proposé | Droit prévu |
| --- | --- | --- |
| Gratuit | 0 € | Aperçus et réservations gratuits ; une entrée par jour, heure de Paris |
| Entrée supplémentaire | 0,99 € | Une entrée ; une sortie volontaire la consomme |
| Trois entrées | 2,49 € | Trois entrées distinctes, sans obligation d’abonnement |
| Accès privé | 1,90 € | Après accord réciproque, accès du demandeur ; l’invité accepte gratuitement |
| Découverte | 3,90 € / 7 jours | Premier essai par compte, arrêt automatique, aucun passage imposé au mensuel |
| Premium mensuel | 9,90 € / mois | Entrées sans plafond quotidien pendant la période active, selon les places et règles de sécurité |
| Premium annuel | 69,90 € / an | Paiement annuel, environ 5,83 €/mois ; économie de 48,90 € sur douze mois au tarif mensuel |
| Création de 20 places | 6,90 € | Un crédit de création |
| Création de 50 places | 12,90 € | Deux crédits de création |
| Création de 100 places | 24,90 € | Quatre crédits de création |

Premium inclut une publication de 20 places par période glissante de 30 jours, sans accumulation. Les créations de 50 ou 100 places et les créations supplémentaires utilisent des crédits achetés. Un avantage expiré ne peut jamais augmenter le plafond de crédits confirmé par l’organisateur. La création n’inclut pas les entrées des participants ou de l’organisateur : leurs quotas habituels restent applicables. Les achats futurs de crédits devront indiquer explicitement qu’ils peuvent être combinés pour financer un format plus grand ; le solde n’est pas un montant monétaire retirable.

Les prix sont identiques pour tous les genres. La valeur payante porte sur la liberté d’entrée, les échanges consentis et la capacité d’organisation. La sécurité, le refus, le blocage et le signalement restent accessibles à tous. Aucun achat ne garantit un match, une réponse ou un salon rempli.

La semaine passe de 1,90 € à 3,90 € pour réduire l’écart avec l’usage vidéo possible. Mensuel et annuel restent abordables. L’ancien laboratoire Stripe D1 conserve ses anciens tarifs de test ; les nouveaux achats de semaine et de création ne lui sont pas envoyés. Aucun ancien prix Stripe, abonnement ou achat enregistré n’est modifié. Le catalogue Supabase et la délivrance des nouveaux droits payants restent à relier à Checkout et aux webhooks signés avant toute vente.

Résiliation mensuelle/annuelle : arrêt du renouvellement, accès conservé jusqu’à l’échéance. Garantie commerciale de 15 jours sur la souscription initiale ; elle ne remplace pas les droits légaux. La semaine n’a pas de renouvellement automatique. Les consentements et éventuels remboursements après démarrage immédiat restent à valider juridiquement avant commercialisation.

## Recette de Momento et coûts

La recette de Momento vient des abonnements et options vendus. Ce n’est pas une commission sur un billet revendu par l’organisateur ; aucune billetterie ou rémunération des hôtes n’est mise en place.

Stripe France affiche 1,5 % + 0,25 € pour les cartes standard de l’EEE. Une entrée à 0,99 € laisse environ 0,73 € après ces seuls frais ; le pack à 2,49 € environ 2,20 €. Cela favorise les packs sans imposer un gros portefeuille. Sur 9,90 €, ces frais représentent environ 0,40 €, auxquels Billing à l’usage peut ajouter 0,7 % du volume traité, soit environ 0,07 €. Restent ensuite fiscalité applicable, vidéo, hébergement, courriels, modération, support, remboursements et acquisition. Ce montant n’est donc pas un bénéfice net.

Sources : [Stripe Payments](https://stripe.com/fr/pricing), [Stripe Billing](https://stripe.com/fr/billing/pricing). La TVA et les obligations du vendeur doivent être confirmées avant lancement ; aucun calcul automatique de taxe n’est activé par ce travail.

## La vidéo n’est pas gratuite à toute échelle

Au relevé, LiveKit Cloud Build inclut 5 000 minutes WebRTC, 50 Go sortants et 100 connexions simultanées. Ship est annoncé à partir de 50 $/mois, avec 150 000 minutes, 250 Go, puis 0,0005 $/minute et 0,12 $/Go. Ces chiffres concernent des participants humains, sans agents IA ni enregistrement. Aucun changement d’offre ou activation payante n’a été effectué.

Hypothèse technique illustrative : chaque participant reçoit un seul flux distant moyen de 1 Mbit/s pendant 55 minutes. Les octets sont comptés en Go décimaux. Ce débit n’est pas une mesure du produit ; codec, résolution, audio seul, relais, reconnexions et règles d’arrondi changent la facture.

| Salon rempli | Minutes-participants | Trafic sortant estimé | Coût marginal Ship hors quotas inclus |
| --- | ---: | ---: | ---: |
| 20 personnes | 1 100 | 8,25 Go | 1,54 $ |
| 50 personnes | 2 750 | 20,63 Go | 3,85 $ |
| 100 personnes | 5 500 | 41,25 Go | 7,70 $ |

Les 100 participants forment des tête-à-tête : aucun navigateur ne doit télécharger 99 vidéos. Dix tours de 5 minutes et leurs transitions tiennent dans un créneau de 55 minutes. Le salon de 100 places ne promet pas de rencontrer les 50 personnes du groupe opposé.

| Hypothèse mensuelle | Minutes-participants | Sortant estimé | Estimation Ship avec les quotas ci-dessus |
| --- | ---: | ---: | ---: |
| 1 000 actifs × 4 séances × 55 min | 220 000 | 1 650 Go | 253 $ / mois |
| 5 000 actifs × 4 séances × 55 min | 1 100 000 | 8 250 Go | 1 485 $ / mois |

Ces scénarios ne sont ni une facture prévisionnelle certaine ni une recommandation de souscrire Ship. Ils excluent les autres coûts et utilisent les tarifs publiés, sans conversion USD/EUR. Comparer des offres, débits et taux de conversion réels avant ouverture. L’hébergement d’un logiciel open source ne rend pas le réseau, le relais TURN ou l’exploitation gratuits.

Sources : [LiveKit tarifs](https://livekit.com/pricing), [guide de calcul des coûts vidéo](https://kb.livekit.io/articles/3947254704-understanding-livekit-cloud-pricing).

## Capacité, UX et sécurité

1 000–5 000 actifs mensuels ne signifie pas 5 000 personnes simultanées. Le pic de présence, les inscriptions lors d’un partage et le nombre de salons en même temps déterminent le dimensionnement.

L’interface charge 12 salons ou relations à la fois avec un curseur stable. Recherche côté serveur, accents français normalisés, requêtes différées de 350 ms, annulation des résultats périmés et aucun sondage continu. Les thèmes, ville et recherche principale restent visibles ; les autres filtres sont repliés. Les requêtes privées en cours peuvent être partagées, leurs réponses terminées ne sont pas conservées en cache.

Les salons femmes/hommes de 20, 50 et 100 places visent respectivement 10/10, 25/25 et 50/50 confirmés. La file suit l’ordre d’inscription de chaque groupe. Un participant confirmé peut repasser en attente si le groupe opposé se vide ; aucune promesse de place immuable. Changement de genre déclaré, âge incompatible, suspension ou blocage de l’hôte retirent une inscription devenue inéligible, puis rééquilibrent les confirmations. Le genre n’est jamais déduit d’une photo, d’un prénom ou d’une couleur. Les autres formats de compatibilité restent à concevoir.

Les brouillons appartiennent à leur auteur. Les invitations privées et inscriptions restent dans un schéma privé avec RLS et sans accès direct membre. Le lien social ne contient ni liste de personnes ni contact ; il peut être remplacé. Les personnes confirmées conservent leur accès après rotation du lien. Un lien non listé peut naturellement être repartagé par son détenteur.

Un brouillon ne coûte rien. Seule la publication consomme atomiquement les crédits autorisés, avec un verrou du profil et du salon. Une répétition ne redébite pas. Annuler avant le départ ferme le lien et les réservations, puis rétablit les crédits utilisés une seule fois ; cela ne déclenche pas un remboursement bancaire. La création incluse est également rétablie. Les annulations dues à la modération nécessitent une politique de remboursement avant ouverture.

Limites initiales : 90 lectures de communauté par compte et minute ; 60 aperçus partagés par IP et minute ; 10 brouillons, 3 salons publiés à venir et 5 publications quotidiennes par hôte. Les inscriptions basiques sans courriel utilisent un budget distinct de 500 nouvelles inscriptions/jour par défaut, configurable de 1 à 5 000, avec limites par IP/adresse. Le budget d’envoi des courriels n’est pas augmenté. Les refus temporaires fournissent `Retry-After`. Ces protections ne remplacent pas une défense contre les inscriptions automatisées à grande échelle.

## Validations encore nécessaires avant ouverture

- Ordonnanceur et check-in par paires pour 20/50/100, gestion des absents, des swipes et des reconstitutions ; pas seulement un équilibre des réservations.
- Jetons média limités au binôme et à sa durée, révocation effective, validation audio/vidéo sur deux comptes et deux appareils.
- Essais de charge sur un environnement de test isolé : montée 20 → 50 → 100 puis 250 connexions, arrivée concentrée au check-in, coupures et reconnexions. Mesurer p95, erreurs, saturation, temps de rotation et consommation vidéo ; fixer ensuite les limites et seuils d’alerte. Aucun test de charge n’a été réalisé sur le site public.
- Paiements Supabase : catalogue versionné, Checkout, webhooks signés et idempotents, droits révoqués après remboursement, contrôle de l’environnement, consentement au prix et remboursements des créations.
- Envoi fiable des courriels, récupération du compte, validation des adresses, mesures anti-abus, supervision et restauration testée.
- Modération opérationnelle, politique de confidentialité et CGV validées, traitement des données de rencontre, contact exploitant, budget et seuils d’usage. Aucun enregistrement vidéo par défaut.

Les tests locaux sur 5 000 profils et 5 000 salons vérifient la pagination, les accès et les règles métier ; ils ne prouvent pas que la production supporte 5 000 utilisateurs simultanés. Les protections RLS des tables privées sans politique autorisent volontairement zéro accès direct membre. La protection Supabase contre les mots de passe compromis reste un point connu de la configuration existante, sans changement d’abonnement ici.
