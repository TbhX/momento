# Sécurité de Momento

Ce document décrit les contrôles présents et les validations restantes. Il ne constitue pas un audit d’intrusion indépendant.

## Comptes et double authentification

Supabase Auth conserve les identités. Le Worker vérifie l’utilisateur et la session native avant les espaces privés ; les cookies sont Secure, HttpOnly et limités à l’hôte. Une révocation est contrôlée sans attendre l’expiration du JWT. Les rôles viennent de la base privée, jamais des métadonnées modifiables du compte.

Mon profil → Sécurité et double authentification permet de configurer une application TOTP. L’ajout exige le mot de passe actuel ; sa vérification transitoire est séparée de la session courante et la session transitoire est fermée. La configuration ne devient active qu’après un code valide. Deux applications maximum peuvent être proposées par cette interface, notamment pour disposer d’un secours. Retirer une application active exige un nouveau code de celle-ci. Les limites sont appliquées côté serveur, par compte et adresse réseau, et les réponses sensibles ne sont pas mises en cache.

La clé et le QR code de configuration sont affichés uniquement dans le dialogue courant. Ils ne sont ni journalisés par l’application ni conservés dans localStorage/sessionStorage. Fermer ou masquer le dialogue les retire de la vue. Les secrets Auth nécessaires au fonctionnement de TOTP restent gérés par Supabase. Le navigateur ne reçoit aucun jeton de session dans le JSON des opérations MFA ; les cookies HttpOnly assurent leur transmission.

Après activation, les lectures/écritures privées exigent le niveau AAL2. Le contrôle est effectué par le Worker et dans la fonction de session utilisée par les politiques restrictives RLS : appeler directement la Data API avec une session AAL1 ne contourne pas cette protection. Un second facteur simplement en attente ne suffit pas. Sans facteur actif, les comptes membres ordinaires peuvent continuer à se connecter par mot de passe.

L’administration, la modération, la publication de salons de test et l’accès au laboratoire illimité exigent une application active et une session AAL2. Le rôle seul ne suffit plus. Le formulaire d’activation initial d’un administrateur conserve son code privé à usage unique ; il ne dispense pas de configurer MFA pour les opérations privilégiées suivantes. Aucun facteur n’est créé à la place du propriétaire.

La fermeture de toutes les connexions utilise la révocation globale native. Une session AAL1 d’un compte protégé doit d’abord valider son second facteur pour utiliser cette action ; la déconnexion locale reste disponible.

Conserver la clé dans un gestionnaire de mots de passe ou une application de secours avant activation. La version actuelle ne propose pas de récupération automatique d’un second facteur perdu par e-mail. Ne jamais transmettre mot de passe, code ou clé en discussion, ticket, capture publique ou dépôt.

## Navigateur et requêtes

Les réponses privées et erreurs sont sans cache. Le site interdit son intégration en iframe, les URL de base injectées et les balises script intégrées au HTML ; les scripts applicatifs restent servis depuis la même origine. Les API refusent les requêtes signalées cross-site ou comportant une origine étrangère avant d’accéder à Auth ou aux données. Les écritures conservent leur marqueur explicite et leurs contrôles d’origine.

Les permissions caméra/micro sont limitées à la même origine, sans activation automatique. Géolocalisation, paiement navigateur et périphériques non utilisés sont interdits. Les en-têtes évitent l’envoi du lien courant comme référent à un tiers. Les images publiques de partage restent lisibles par les services sociaux ; les réponses API sont limitées à leur origine.

Pour la cible Supabase actuelle, les connexions réseau du navigateur restent sur l’origine Momento et les iframes vidéo tierces sont interdites tant que les médias natifs sont fermés. L’intégration future devra préciser les origines média exactes, les autorisations par binôme et la révocation avant de modifier cette politique.

Le cadre de navigation initial et les cinq documents publics pré-rendus n’utilisent plus d’attributs d’événement exécutables. Les écouteurs du script local capturent uniquement les destinations connues et préservent les comportements natifs des liens ; aucune résolution de nom de fonction depuis le HTML n’est ajoutée. Les tests bloquent la réintroduction de gestionnaires intégrés dans ces documents.

Limite connue : les gestionnaires d’événements HTML historiques restent autorisés par `script-src`. `script-src-elem 'self'` bloque les balises script injectées mais ne remplace pas leur refonte complète. Ne pas présenter la politique comme supprimant tout risque XSS. Les données de membres affichées doivent rester échappées et les accès sensibles validés côté serveur.

## Données et exploitation

Les photos passent par une autorisation du Worker ; aucun lien public Storage n’est accordé. RLS et droits SQL protègent les données, avec refus par défaut sur les tables privées. Les simulations administrateur ne créent aucun crédit réel. Les médias, admissions et ventes réels restent fermés.

Les tests SQL utilisent des bases locales isolées. Les vérificateurs ne créent aucun compte, crédit ou salon synthétique dans la base hébergée. Une migration est revue, rejouée localement, appliquée sur le projet vérifié puis archivée avec sa version distante réelle.

Le contrôle de dépendances du 26 octobre 2026 (`pnpm audit --prod`) ne signale aucune vulnérabilité connue ; cette vérification doit être répétée et ne prouve pas l’absence de faille.

Avant ouverture complète : configurer et tester confirmation/récupération e-mail ; terminer la suppression des événements HTML intégrés ; valider médias et interruptions avec deux comptes/appareils ; exercer modération et gestion des abus ; configurer alertes et procédure d’incident ; disposer de sauvegardes protégées et d’un essai de restauration ; réaliser un audit d’intrusion indépendant. Le contrôle natif des mots de passe compromis reste signalé comme désactivé ; aucun passage à une offre payante n’est effectué implicitement.

Références : [MFA Supabase](https://supabase.com/docs/guides/auth/auth-mfa), [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [pratiques Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

## Aperçus et bilan de l’essai

L’aperçu de salon est réduit dès la fonction SQL : âge, ville et profession restent à null dans le contrat historique. La route applicative transmet seulement identifiant technique et prénom. Le contrôle s’applique donc aussi à l’appel direct de ce RPC ; les règles de session, MFA, salon découvrable, présence et blocage restent requises.

Le récapitulatif local de sortie n’affiche que les personnes rencontrées durant cet essai, les propres likes et les accords réciproques ; aucun like reçu seul. Il n’est pas persisté, ne renvoie pas de clé de requête et n’accorde aucun accès. Noms insérés comme texte, confirmation liée au compte/persona et au flux courant, retrait du contenu à la fermeture et à l’arrière-plan. Le dialogue bloque les gestes de swipe sous-jacents. Le bouton de présence fictive est explicitement identifié et ne contacte aucune API d’admission ou de média. Les tests de ces vues ne constituent pas une validation de présence réelle ou de jeton vidéo.

## Préparation serveur avant média

Le schéma préparé des présences courtes les rattache aux sessions natives dans des tables privées. Son application distante est en attente après une erreur du connecteur ; les tests portent sur des bases isolées. Le serveur contrôle les deux membres, modes, présences, réservations et délais avant de retourner leur état commun. Le retrait reste possible après fermeture ; un accord retiré ne reprend pas après réouverture ou déblocage. Ces routes ne créent ni token ni accès fournisseur. Les droits d’ouverture restent fermés et l’interface d’essai ne les appelle pas. L’évaluation ne remplace pas la revalidation transactionnelle et la révocation au niveau du futur fournisseur média. Les tests isolés ne prouvent ni une charge concurrente réelle, ni l’arrêt distant d’un flux sur téléphone.
