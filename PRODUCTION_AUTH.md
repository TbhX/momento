# Connexion Momento sans ChatGPT

État du 20 octobre 2026 : adaptateur et parcours implémentés, contrôles automatisés disponibles. **L’hébergement autonome et les fournisseurs ne sont pas activés.** Le site Sites existant demeure une bêta privée avec sa connexion ChatGPT ; sa publication ne constitue pas le déploiement autonome décrit ici.

## Architecture et données

Le build autonome utilise Supabase Auth pour l’identité uniquement, Cloudflare D1 pour les données métier et R2 privé pour les profils/images. Il ne nécessite ni compte ni abonnement ChatGPT. Aucun déplacement vers Postgres ni modification du projet Supabase existant n’a été effectué. Le connecteur retourne un projet nommé `TbhX's Project` ; rien n’établit qu’il soit dédié à Momento. Ne pas lui appliquer les réglages de Momento sans identifier le bon projet.

`node scripts/build.mjs --standalone` produit `production-dist/worker.js` et `production-dist/public/`. Les fichiers vidéo lourds sont des assets statiques ; ils ne gonflent pas le script serveur. `deploy/worker.example.jsonc` décrit les bindings à configurer dans le compte Cloudflare du propriétaire. Le stockage D1/R2 géré par Sites n’est pas implicitement exporté ni accessible dans ce compte.

Pour le choix **Cloudflare Pages + GitHub**, `pnpm run build:pages` produit `pages-dist/` avec `_worker.js` et le binding automatique Pages `ASSETS`. Les réglages Git et de build sont dans [README.md](README.md), et le modèle optionnel est `deploy/pages.example.jsonc`. Le dépôt GitHub choisi par le propriétaire est **TbhX/momento**, privé ; la marque de l’application reste Momento. Le dépôt et l’hébergement Pages sont deux éléments distincts : le premier transfert ne déploie pas automatiquement un projet Pages non connecté.

Le code métier commun reçoit uniquement l’identité vérifiée par le serveur. En autonome, tous les en-têtes entrants `oai-authenticated-*` sont supprimés, puis remplacés après `supabase.auth.getUser()` par l’identité retournée par Supabase. Les comptes utilisent `supabase:<uuid>`. Les données de la bêta Sites restent séparées ; **aucune fusion par email**. Une reprise éventuelle des comptes doit prouver la possession des deux identités.

## Moyens de connexion

| Connexion | Code | Activation externe nécessaire |
| --- | --- | --- |
| Google | OAuth PKCE + retour serveur | Client OAuth Google, écran Momento, identifiant/secret dans Supabase |
| Apple | OAuth PKCE + retour serveur | Services ID et clé Apple, fournisseur Supabase, renouvellement de la clé selon Apple |
| Facebook | OAuth PKCE + retour serveur | Application Meta, configuration/validation fournisseur selon son usage |
| SMS | Saisie du numéro E.164, code à 6 chiffres | Fournisseur SMS dans Supabase, pays autorisés, dépenses plafonnées, contrôle anti-abus avant ouverture |

Seuls les moyens activés dans Supabase **et** autorisés côté serveur sont proposés. Si rien n’est configuré, aucun bouton n’annonce une connexion fonctionnelle. Les parcours ne demandent ni contacts, ni publication sur les réseaux sociaux. Apple est préparé pour la future version iPhone ; la conformité et les achats des applications natives restent à traiter séparément.

La connexion Google n’exige pas d’envoi de SMS. Les SMS ont un coût fournisseur : aucun abonnement SMS, crédit payant ou envoi réel n’a été déclenché ici. Le mode SMS est désactivé par défaut. Le quota Momento ne plafonne que les requêtes passant par Momento : le point d’entrée Auth Supabase reste joignable avec la clé publiable. Il faut donc aussi configurer la protection et le budget **chez Supabase et le fournisseur SMS**, et activer leur protection contre les robots avant ouverture publique. Il n’est pas correct de promettre un SMS gratuit et illimité.

## Réglages d’activation

1. Identifier/créer un projet Supabase dédié Momento dans la bonne organisation et un hébergement Cloudflare appartenant au propriétaire. Vérifier les quotas et coûts avant souscription. Ne pas reprendre les clés d’une autre application.
2. Choisir l’URL HTTPS finale. Renseigner exactement cette origine dans `MOMENTO_APP_ORIGIN`, et ajouter uniquement `https://<domaine>/api/auth/callback` à la liste de redirections Supabase. Supprimer les redirections de développement en production.
3. Configurer Google dans Google Auth Platform avec `openid`, email et profil uniquement. L’URI de retour Google est `https://<ref>.supabase.co/auth/v1/callback`, **différente** de l’URL de retour Momento. Le client ID/secret Google se stocke dans le fournisseur Google de Supabase, jamais dans le navigateur ou le dépôt.
4. Activer les fournisseurs Apple/Facebook désirés dans Supabase et dans leurs consoles. `AUTH_OAUTH_PROVIDERS=google,apple,facebook` définit la liste autorisée par Momento. Le fournisseur Supabase doit aussi être réellement actif.
5. Configurer `SUPABASE_URL`, la clé moderne `SUPABASE_PUBLISHABLE_KEY` et `AUTH_COOKIE_SECRET` (au moins 32 caractères aléatoires, secret serveur). Aucune clé `service_role` n’est nécessaire à la connexion. `MOMENTO_ADMIN_USER_IDS` contient les UUID Supabase des seuls administrateurs. Un email ou une métadonnée de profil ne donne aucun rôle.
6. Configurer des bindings D1/R2 privés propres à cet hébergement, appliquer les migrations existantes et saisir les secrets LiveKit/Stripe de test par le gestionnaire de secrets. Aucun identifiant du stockage Sites n’est réutilisé implicitement. Les variables du modèle laissent les sessions et les paiements réels fermés.
7. Pour les SMS seulement : configurer le fournisseur et ses plafonds, des pays autorisés, les numéros de test et l’anti-abus Supabase. Après validation, `AUTH_SMS_ENABLED=true` et `AUTH_SMS_DAILY_BUDGET` entre 1 et 500 (20 par défaut). Chaque tentative d’envoi réserve un budget, même en cas d’échec.
8. Tester d’abord une publication autonome restreinte au pilote : navigation anonyme de l’accueil, Google/Apple/Facebook, refus d’autorisation, SMS de test puis réel autorisé, expiration, déconnexion, plusieurs appareils, partage/vol de lien PKCE et absence d’accès à un autre compte. Tester ensuite les webhooks Stripe signés sur l’origine autonome sans barrière ChatGPT.

Les sessions passent par des cookies `__Host-`, Secure, HttpOnly, SameSite=Lax, sans domaine parent. Le navigateur appelle seulement les API Momento ; aucun SDK Supabase navigateur, JWT ou refresh token dans localStorage. Les réponses d’identité sont sans cache. Le retour OAuth est fixé à l’origine configurée ; aucun `returnTo` arbitraire n’est accepté. Les mutations exigent Origin et marqueur CSRF. Les codes PKCE sont échangés côté serveur.

Le SMS lie le numéro à un cookie signé de cinq minutes. Les compteurs D1 limitent les envois par IP, numéro et jour, et les vérifications par défi et IP. Les clés des compteurs sont des HMAC ; numéro, IP et code ne sont pas journalisés. Le code SMS n’est jamais enregistré par Momento. Ces contrôles complètent ceux du fournisseur ; ils ne les remplacent pas.

## Limites avant lancement professionnel

Cette livraison prépare **l’authentification indépendante**. Elle ne transforme pas les salons fictifs en sessions multi-utilisateurs. Les amis, invitations, quotas et crédits du nouveau salon doivent encore devenir des transactions serveur ; les essais caméra sur téléphones, ordonnanceur vidéo, modération, mentions légales, webhooks et ventes réelles restent à valider.

« Supprimer mon profil Momento » efface les données métier, pas l’utilisateur dans Supabase Auth. Avant production, prévoir une suppression complète avec révocation des sessions et effacement de l’identité via un chemin serveur privilégié contrôlé. Le support doit disposer d’un canal réel pour traiter ces demandes ; aucune adresse fictive n’est ajoutée. Le texte de confidentialité du build autonome décrit cette limite.

Les tests automatisés utilisent un serveur Auth simulé ; un succès n’établit ni que les clés réelles soient configurées, ni qu’un OAuth réel ou un SMS ait été validé. Pas de validation navigateur/GPU/appareil revendiquée.

Références : [Google Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [SMS Supabase](https://supabase.com/docs/guides/auth/phone-login), [sessions et révocation](https://supabase.com/docs/guides/auth/sessions), [cookies serveur](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [assets Cloudflare](https://developers.cloudflare.com/workers/static-assets/binding/).
