# Momento — travaux de production

## Noyau de rotation par binômes

Un premier moteur pur prépare les dix tours du format équilibré pour 20, 50 ou 100 participants : préférences réciproques, présence récente, session active, confirmations, blocages, apartés et historique des paires. Le couplage maximise le nombre de rencontres possibles dans l’instantané et ne réutilise aucune paire déjà proposée dans l’événement. Les tours gardent leurs 5 minutes puis 30 secondes de choix, sans rattrapage tardif ni tour final incomplet. L’absence de personne compatible, l’attente et l’épuisement des rencontres sont distingués.

Ce noyau est volontairement sans route, minuterie ou accès base : il ne démarre aucun appel. Le [contrat d’intégration](ROTATION_ENGINE.md) précise les instantanés à lire côté serveur, les réservations atomiques et contraintes d’unicité à créer, la relecture après réponse perdue et les validations avant jeton média. La répétition locale reste séparée. Prochaine priorité : persister check-in, préférences et tours sur une base de développement, tester les ordonnancements concurrents et les révocations avant raccordement des médias. Aucun drapeau ni donnée du projet hébergé n’est modifié.

Validation : 357 tests locaux et build Pages réussis, dont treize nouveaux tests, comparaison des 512 graphes possibles de taille 3×3 à un maximum exhaustif indépendant, et dix rotations sans répétition pour chacune des capacités. Le contrôle du déploiement est distinct des tests locaux ; aucun appel réel, charge simultanée ou téléphone physique n’est annoncé.

## Présentation publique, SEO et photos Premium

Le parcours courant ne présente plus les bandeaux de chantier ni le journal de développement. L’administration conserve son laboratoire identifié ; les actions réellement indisponibles l’indiquent au moment utile. Aucun drapeau d’admission, de vente ou de média n’est activé.

Cinq pages publiques disposent de chemins lisibles, de contenu HTML avant JavaScript, de titres/descriptions propres, de liens explorables, d’une URL canonique, de métadonnées de partage et d’un sitemap. Les anciens liens à fragment restent compris. La navigation conserve le cadre d’application et les panneaux membres restent soumis au compte et au profil complet. Le SEO ne garantit aucune position dans les moteurs. Référence : [guide JavaScript SEO de Google](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

Les membres gratuits voient un visuel neutre flouté et une invitation à découvrir Premium, sans URL de photo nette dans le composant. Premium peut consulter les photos des personnes présentes dans un salon visible, sous réserve de la session active, des blocages, de la présence et de la période d’abonnement. Le Worker télécharge l’image privée après validation Auth-bound en base ; aucun lien Storage public ni cache privé persistant. La répétition utilise des portraits illustratifs et ses droits locaux ne donnent aucun accès aux images d’un vrai membre.

À épuisement des personnes compatibles, un encart « Vous avez vu tous les participants » propose de découvrir un autre salon. Il ne réinitialise pas les rencontres et ne consomme pas une entrée automatiquement. 344 tests locaux et build Pages réussis. La fonction de photos a été appliquée après vérification de l’identité et de l’historique du projet, puis les droits/RLS et autorisations fermées ont été relus, sans fixture hébergée. Le déploiement et les essais sur appareils sont suivis séparément.

## Salons de test et table ronde

L’administrateur activé peut enregistrer un brouillon puis choisir « Publier pour tester ». Le serveur relit le rôle privé et la session active, exige l’environnement de test, impose la propriété du brouillon et publie uniquement par lien. Le statut « Salon de test » apparaît sur la carte sociale et l’invitation. Aucun crédit réel ni avantage de création Premium n’est consommé. Rejouer la publication ne crée ni deuxième salon ni deuxième écriture. Ces salons restent interdits aux admissions réelles, même si les autres autorisations sont activées ultérieurement. La perte du rôle admin masque leur lien public.

La page publique est un teaser court avec inscription et connexion, sans préférences, participants ni actions de salon. Le formulaire complet de création est également réservé aux membres. Dans la répétition, les envies précèdent la proposition : genre déclaré, âges, centre d’intérêt et intention amitié/amour/les deux. Le répertoire montre seulement les prénoms. Avant l’heure fixée, la confirmation prépare une entrée sans quota, appareils ni chrono de rencontre ; sortir de l’attente annule cette préparation. Au départ, la première personne n’est proposée qu’après confirmation et contrôle du quota.

Les prénoms rencontrés sont mémorisés localement par compte/persona et événement. Changer les envies, sortir, revenir ou continuer un tour ne les remet pas dans la sélection. Les nouvelles entrées et rotations cessent à la fin du créneau ; les apartés déjà consentis conservent leur échéance. L’admin peut avancer au départ dans sa répétition. Les horaires des salons de test viennent de l’invitation ; les démonstrations génériques utilisent un quart d’heure fixé une fois. Les appareils restent éteints sans action explicite.

Les appels distants, ventes et publications ordinaires restent fermés. Les réservations de test sont persistantes mais la table ronde utilise des profils fictifs locaux : elles ne prouvent pas un appel entre les membres réservés. Prochaine priorité : raccorder l’ordonnanceur, les préférences réciproques et les médias authentifiés avant toute admission réelle.

Validation : tests SQL sur le schéma déclaré et sur les migrations, tests de routes Worker et d’interface ; aucune fixture créée dans la base hébergée. Les vérifications distantes et du déploiement sont consignées séparément.

## Livraison précédente : laboratoire administrateur illimité

Deux accès admin permettent de tester le parcours Gratuit ou Premium avec crédits locaux illimités. Les entrées répétées, accès privés et prolongations peuvent être rejoués sans achat fictif de secours. Les accords et délais restent nécessaires. Le droit d’ouvrir ce laboratoire est relu via la session et le rôle privés, sans faire confiance au navigateur. L’indicateur illimité n’est pas sérialisé et est désactivé à la déconnexion, au changement de profil de test ou à la perte du rôle relue par le site.

Pour la précédente livraison du laboratoire illimité : aucune migration, attribution de crédits réels, modification du compte organisateur, activation média ou vente n’est effectuée. Validation locale : 322 tests et build Pages ; la vérification du déploiement est consignée séparément. L’essai réel sur le compte du propriétaire et deux appareils n’est pas annoncé sans preuve.

## Salons personnalisables et répertoires paginés

Les capacités 20/50/100, les brouillons persistants, les liens de partage, le droit de publication et la liste d’attente équilibrée disposent d’un socle serveur. Un aperçu du concept est public ; le formulaire de création et l’enregistrement des brouillons sont réservés aux comptes inscrits avec profil complet. La publication exige plusieurs validations distinctes et reste désactivée. Les crédits sont isolés par environnement, consommés à la publication et restitués une seule fois après une annulation avant le départ. Un abonnement expiré ne peut augmenter le coût autorisé. Les prix proposés et leurs limites sont documentés dans [PRICING_AND_CAPACITY.md](PRICING_AND_CAPACITY.md).

L’interface recherche 12 salons, amis ou invitations à la fois côté serveur. Les tests locaux utilisent 5 000 profils et 5 000 salons synthétiques, sans aucune donnée de test dans le projet hébergé. Ils vérifient les droits et la pagination ; un vrai test de charge simultané et la validation de l’ordonnanceur média restent nécessaires. Les achats réels restent fermés.

Priorités : rotations/check-in pour 20/50/100 avec gestion des absents ; jetons et révocation média par binôme ; tests sur deux comptes/appareils ; Checkout et webhooks vers Supabase ; vérification et récupération de compte par courriel ; modération, documents légaux et supervision. Aucun salon partagé ne doit servir de point d’accès à une conférence de 100 vidéos simultanées dans le même navigateur.

## Socle de consentement et crédits contrôlés côté serveur

Un socle serveur désactivé prépare les échanges réels : votes privés et match après deux oui, demande de prolongation liée à la rencontre et à la session du demandeur, plafond explicite de zéro ou un crédit, réponse réservée à l’invité. La demande ne réserve ni ne consomme de crédit. L’acceptation valide de nouveau les deux présences, les délais, le match, le Premium et le solde, puis inscrit ensemble le débit du demandeur et l’accès privé de trois minutes. Une réponse rejouée restitue le même accès et la même échéance. Aucun achat bancaire ou jeton vidéo n’est créé.

Départ, blocage, suspension, nouvelle rotation, expiration, révocation de la session ou changement d’environnement empêchent une acceptation périmée. Une perte du Premium ne peut pas augmenter le coût autorisé. Les deux participants quittent la rotation après acceptation, sans modifier la durée du tour collectif ; une autre entrée est refusée pendant l’échange privé. L’export personnel inclut les accords, sans exposer les références de session. Les tables restent privées, sans accès direct pour les membres. L’activation exige des autorisations serveur et base distinctes ; elles restent fermées.

## Parcours d’essai conservé

Les rappels à 60 puis 30 secondes aboutissent à un petit encart dans la vidéo. Il laisse l’appel visible, les commandes accessibles et le focus à sa place. Le fond général n’est plus assombri. Fermer l’encart évite sa réapparition pendant le tour ; « Mes choix » reste disponible. Les autres options sont repliées.

Le demandeur confirme le coût conditionnel avant d’envoyer sa proposition de 3 minutes privées. L’invité répond gratuitement. L’accès du demandeur est consommé seulement à l’acceptation ; le solde de l’invité ne peut jamais servir à payer l’offre. Aucun achat fictif pendant l’attente, après refus, annulation ou expiration. Les demandes expirent sous 30 secondes, au plus tard à la rotation. Un tarif ou un avantage modifié ne peut pas augmenter le montant autorisé. Les répétitions ne prolongent ni ne débitent deux fois.

Les rôles demandeur/invité sont testables dans les contrôles de démonstration. L’exemple public montre également les deux côtés, sans appel ni prélèvement. Les clics tardifs, onglets masqués, blocages et appareils arrêtés gardent leurs protections. Masquer une invitation ne l’annule pas ; son demandeur dispose d’un bouton explicite pour l’annuler.

Un parcours membre permet de préparer un appel audio, vidéo ou les deux, puis d’essayer une rencontre avec des profils explicitement fictifs. Les appareils ne sont demandés que sur action, peuvent être coupés et réactivés séparément, et sont libérés à la sortie. Les dispositions côte à côte, verticale et miniature, le cadrage et le plein écran sont disponibles. Le concept public montre une illustration sans ouvrir d’appareil.

Le tour standard reste de 5 minutes, suivi de 30 secondes pour choisir. Like et swipe sont gratuits ; deux likes sont nécessaires au match. La prolongation demande une autorisation du payeur avant envoi puis l’acceptation de l’invité. Les autres propositions conservent leurs accords distincts. Un accès privé existant à 1,90 € couvre le lien ami et un échange privé de 3 minutes avec cette personne, hors rotation. Un second rendez-vous de 15 minutes utilise un autre accès. Premium inclut ces options simulées. Refus, annulation ou expiration ne consomment rien ; accepter est gratuit pour le destinataire. Les répétitions ne débitent pas deux fois. Les profils bloqués ne reviennent pas.

Ce parcours reste une répétition locale. Ses boutons ne créent aucun paiement, droit serveur, appel distant ni entrée réelle de salon. Le socle serveur décrit plus haut n’est pas encore raccordé à cette interface. Il utilise uniquement des crédits déjà disponibles ; le paiement bancaire conditionnel reste à intégrer sans débit avant acceptation. Les relations persistantes existantes n’appliquent pas encore ce nouveau tarif.

Le cadre fixe, le menu latéral, le tiroir mobile, les transitions et les palettes pastel de la livraison précédente sont conservés. Le genre est facultatif et déclaré ; la palette peut être choisie personnellement sans modifier les droits. Les lectures privées ne sont pas conservées en cache.

Validation locale : 344 tests réussis et build Pages réussi. Le contrôle serveur est testé sur le schéma déclaré et les migrations, avec des comptes et présences synthétiques dans des bases isolées. Les appareils sont testés avec des flux simulés ; aucun essai sur téléphone physique, charge concurrente réelle ou appel distant à deux appareils n’est annoncé. La vérification du déploiement est distincte et consignée dans le suivi privé.

L’accès organisateur reste protégé par les rôles privés. Les inscriptions suivent les réglages natifs e-mail, avec profil complété avant les espaces membre. Les simulations Gratuit/Premium ne modifient pas les droits réels.

## Priorités suivantes

1. Relier le parcours et le socle de consentement à deux participants réels : ordonnanceur, rotations, déconnexion et connexion média autorisée côté serveur.
2. Valider les scénarios concurrents et les interruptions à deux appareils ; intégrer ensuite le paiement conditionnel et les droits complets avant toute activation payante.
3. Compléter la gestion des salons et le suivi opérationnel de la modération.
4. Compléter les préférences, les matchs et messages réciproques ; la pagination des salons et relations est en place.
5. Tester les appareils, la supervision, les sauvegardes et la restauration ; finaliser les informations publiques.
6. Valider séparément les paiements, droits, résiliations et remboursements avant toute vente.

Les rencontres publiques et les ventes restent fermées. La démonstration est explicite et séparée. La partie physique reste exclusivement un teaser. Les prix prévus sont identiques quel que soit le genre ; une entrée gratuite quotidienne et Premium pendant la période active sont à faire respecter côté serveur.

Les mises à jour de routine sont autorisées après vérification, en préservant les changements du propriétaire. Un push seul ne prouve pas un déploiement. Les paramètres opérationnels, identifiants et détails d’infrastructure restent dans le suivi privé.
