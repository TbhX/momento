# Connexion Momento sans ChatGPT

État du 20 octobre 2026 : **l’hébergement autonome Pages est déployé** sur `https://momento-7se.pages.dev/`. Les fournisseurs de connexion et les stockages ne sont pas encore configurés. L’organisation Supabase Momento existe ; le connecteur refuse toujours les opérations sur cette organisation. La disponibilité du quota, qui avait bloqué la création auparavant, reste à revérifier après correction de l’accès. Le site Sites existant demeure une bêta privée distincte avec sa connexion ChatGPT.

Choix confirmé par le propriétaire : **Google et adresse e-mail + mot de passe**. Le parcours e-mail/mot de passe, sa confirmation et sa récupération sont implémentés et testés localement, mais ne sont pas encore configurés pour un usage réel. Le SMS est conditionné à l’existence d’un service réellement gratuit ; il reste désactivé et aucun fournisseur payant n’est souscrit. Apple/Facebook sont des possibilités ultérieures. La feuille de route courante est [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md).

## Architecture et données

Le build autonome utilise Supabase Auth pour l’identité uniquement, Cloudflare D1 pour les données métier et R2 privé pour les profils/images. Il ne nécessite ni compte ni abonnement ChatGPT. Aucun déplacement vers Postgres ni modification du projet Supabase existant n’a été effectué. Le connecteur retourne un projet nommé `TbhX's Project` ; rien n’établit qu’il soit dédié à Momento. Ne pas lui appliquer les réglages de Momento sans identifier le bon projet.

`node scripts/build.mjs --standalone` produit `production-dist/worker.js` et `production-dist/public/`. Les fichiers vidéo lourds sont des assets statiques ; ils ne gonflent pas le script serveur. `deploy/worker.example.jsonc` décrit les bindings à configurer dans le compte Cloudflare du propriétaire. Le stockage D1/R2 géré par Sites n’est pas implicitement exporté ni accessible dans ce compte.

Pour le choix **Cloudflare Pages + GitHub**, `pnpm run build:pages` produit `pages-dist/` avec `_worker.js` et le binding automatique Pages `ASSETS`. Les réglages Git et de build sont dans [README.md](README.md), et le modèle optionnel est `deploy/pages.example.jsonc`. Le dépôt GitHub choisi par le propriétaire est **TbhX/momento**, devenu public sur sa décision ; la marque de l’application reste Momento. Le projet Pages `momento` est relié à ce dépôt et sa première compilation distante a réussi. Le schéma Postgres préparé n’a pas été appliqué au projet Volteo ni substitué aux adaptateurs D1/R2.

Le code métier commun reçoit uniquement l’identité vérifiée par le serveur. En autonome, tous les en-têtes entrants `oai-authenticated-*` sont supprimés, puis remplacés après `supabase.auth.getUser()` par l’identité retournée par Supabase. Les comptes utilisent `supabase:<uuid>`. Les données de la bêta Sites restent séparées ; **aucune fusion par email**. Une reprise éventuelle des comptes doit prouver la possession des deux identités.

## Moyens de connexion

| Connexion | Code | Activation externe nécessaire |
| --- | --- | --- |
| Google | OAuth PKCE + retour serveur | Client OAuth Google, écran Momento, identifiant/secret dans Supabase |
| E-mail + mot de passe | Inscription, confirmation/renvoi, connexion et récupération PKCE serveur | Projet dédié, expéditeur SMTP de production et redirections exactes ; tests réels d’envoi/récupération |
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

## Parcours e-mail et mot de passe

Le code est livré ; **aucun SMTP ni fournisseur réel n’a été activé**. Le service d’e-mail de démonstration Supabase ne doit pas servir d’infrastructure d’envoi pour l’ouverture publique.

| Route serveur | Fonction |
| --- | --- |
| `POST /api/auth/email/signup` | Inscription, mot de passe de 12 à 64 caractères et 72 octets maximum, confirmation requise |
| `POST /api/auth/email/resend` | Nouveau lien de confirmation et nouveau défi PKCE, sans redemander le mot de passe |
| `GET /api/auth/callback` | Échange de code PKCE pour confirmation/connexion ; refuse un flux de récupération sur ce retour ordinaire |
| `POST /api/auth/email/signin` | Connexion, adresse confirmée obligatoire, erreur générique pour adresse/mot de passe incorrect ou adresse non confirmée |
| `POST /api/auth/email/recover` | Demande de lien, acquittement générique et intention de récupération signée liée au navigateur |
| `GET /api/auth/recovery/callback` | Vérifie l’intention, le défi PKCE et l’adresse ; crée une autorisation de changement liée à l’UUID et à la session |
| `POST /api/auth/email/password` | Consomme cette autorisation une fois, change le mot de passe et demande une déconnexion globale |

Configuration, uniquement sur le bon projet :

1. Activer le fournisseur e-mail **avec confirmation d’adresse**. Si Supabase annonce une confirmation automatique, Momento masque et refuse ce parcours. Aucun email/client ne donne un rôle admin.
2. Configurer le SMTP, un expéditeur réel et ses protections DNS. Copier les modèles [confirmation.html](supabase/templates/confirmation.html) et [recovery.html](supabase/templates/recovery.html) dans les modèles Supabase correspondants. Conserver `{{ .ConfirmationURL }}` : ne pas remplacer par une URL de session ni introduire un jeton dans le JavaScript. Sujets proposés : « Confirmez votre adresse — Momento » et « Choisissez un nouveau mot de passe — Momento ».
3. Configurer Site URL sur `https://momento-7se.pages.dev`, avec exactement ces deux retours : `https://momento-7se.pages.dev/api/auth/callback` et `https://momento-7se.pages.dev/api/auth/recovery/callback`. Ne pas autoriser un domaine de retour fourni par l’utilisateur.
4. Disposer du binding `DB` et de sa table `rate_limits`, puis du secret `AUTH_COOKIE_SECRET` de 32 caractères aléatoires ou plus. Cette partie utilise encore D1 : Postgres ne remplace pas implicitement les requêtes SQLite.
5. Après configuration dans un environnement de test, activer `AUTH_EMAIL_ENABLED=true` avec `AUTH_EMAIL_DAILY_BUDGET=20` (entre 1 et 500). Laisser la valeur `false` sur l’hébergement public tant que l’envoi et tous les parcours réels ne sont pas validés. La clé reste publiable côté serveur ; aucune clé d’administration Auth n’est requise pour ces opérations.

Les liens sont liés au navigateur d’origine et aux cookies PKCE, valables dix minutes côté Momento. Une ouverture sur un autre appareil demande de refaire la demande depuis cet appareil. Après ouverture d’un lien de récupération valide, le formulaire dispose de quinze minutes. Son autorisation est signée, liée à l’identité et à la session vérifiées et consommée par insertion atomique unique. Un rejeu ou deux requêtes concurrentes ne peuvent pas appliquer deux changements. Un refus explicite du fournisseur pour mot de passe insuffisant permet de corriger le formulaire ; une opération dont l’issue est incertaine demande un nouveau lien.

Envois : 1 par minute et 3 par heure/adresse, 5 par heure/IP, plus le budget quotidien partagé entre inscription, renvoi et récupération. Connexions : 10 par quinze minutes/adresse et 20/IP. Les compteurs ne contiennent que des identifiants HMAC ; pas d’e-mail, IP ni mot de passe en clair. Les limites natives et la protection anti-robots Supabase restent à configurer : le filtrage Momento ne remplace pas ceux du fournisseur. Les messages génériques réduisent l’énumération des comptes sans constituer une garantie contre tous les canaux temporels du fournisseur.

Le mot de passe traverse uniquement l’API HTTPS et Supabase, n’est pas enregistré par Momento et est effacé des champs après soumission. Les formulaires prévoient les gestionnaires de mots de passe, leur confirmation et un affichage volontaire. Après changement réussi, les cookies locaux sont effacés et une nouvelle connexion est demandée. Si la déconnexion globale échoue, la réponse et l’interface l’indiquent ; elles ne prétendent pas avoir fermé toutes les connexions. Comme déjà indiqué, la révocation du refresh token ne supprime pas immédiatement un JWT copié : le contrôle strict des sessions sensibles reste nécessaire.

Vérification : suite de **129 tests** réussis, dont tests serveur avec un Auth simulé et tests DOM avec `jsdom` 26.1.0 ; aucun message réel envoyé. Tester encore la délivrabilité, les liens sur appareils réels, les refus et reprises, ainsi que la suppression/révocation complète du compte avant ouverture.

Le SMS lie le numéro à un cookie signé de cinq minutes. Les compteurs D1 limitent les envois par IP, numéro et jour, et les vérifications par défi et IP. Les clés des compteurs sont des HMAC ; numéro, IP et code ne sont pas journalisés. Le code SMS n’est jamais enregistré par Momento. Ces contrôles complètent ceux du fournisseur ; ils ne les remplacent pas.

## Limites avant lancement professionnel

Cette livraison prépare **l’authentification indépendante**. Elle ne transforme pas les salons fictifs en sessions multi-utilisateurs. Les amis, invitations, quotas et crédits du nouveau salon doivent encore devenir des transactions serveur ; les essais caméra sur téléphones, ordonnanceur vidéo, modération, mentions légales, webhooks et ventes réelles restent à valider.

« Supprimer mon profil Momento » efface les données métier, pas l’utilisateur dans Supabase Auth. Avant production, prévoir une suppression complète avec révocation des sessions et effacement de l’identité via un chemin serveur privilégié contrôlé. Le support doit disposer d’un canal réel pour traiter ces demandes ; aucune adresse fictive n’est ajoutée. Le texte de confidentialité du build autonome décrit cette limite.

Les tests automatisés utilisent un serveur Auth simulé ; un succès n’établit ni que les clés réelles soient configurées, ni qu’un OAuth réel ou un SMS ait été validé. Pas de validation navigateur/GPU/appareil revendiquée.

Références : [Google Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [SMS Supabase](https://supabase.com/docs/guides/auth/phone-login), [sessions et révocation](https://supabase.com/docs/guides/auth/sessions), [cookies serveur](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [assets Cloudflare](https://developers.cloudflare.com/workers/static-assets/binding/).
