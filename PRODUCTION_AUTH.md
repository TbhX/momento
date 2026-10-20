# Connexion et comptes Momento sans ChatGPT

La cible autonome est [Cloudflare Pages](https://momento-7se.pages.dev/) et le projet Supabase Momento `yhtngbkjqffkhfjadjzp`, organisation `ihyvwxutvbldkgsomhcp`, Free à Paris. Aucun compte ChatGPT n’est nécessaire aux utilisateurs de Momento. Le prototype Sites garde sa connexion et ses données distinctes.

Les comptes/profils, consentements, photos et décors privés, compteurs Auth et autorisations de récupération sont portés vers Postgres/Storage. Les quatre migrations sont décrites dans [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Le catalogue des salons, les amis, invitations et blocages sont aussi persistants. Les appels, admissions, matchs/messages et achats réels restent à terminer.

**Le choix courant est e-mail et mot de passe simples ; Google est reporté et l’inscription Pages reste fermée à la suite du refus du contrôle automatique.** Le client Google n’est pas configuré ; sa console n’est pas accessible dans le navigateur de cette session. Le propriétaire a indiqué ne posséder aucun domaine d’expéditeur : aucun SMTP de production n’est vérifié. Les modèles français sont préparés dans `supabase/templates/`. Le SMS demeure désactivé, sans fournisseur payant souscrit.

## Paramètres serveur

`SUPABASE_DATA_ENABLED=true` sélectionne le backend de compte Postgres/Storage et exige une clé moderne `SUPABASE_SECRET_KEY`. La clé publiable `SUPABASE_PUBLISHABLE_KEY` sert au client de session et aux accès RLS. Le client privilégié est créé séparément, sans persistance ni renouvellement de session ; il ne reçoit jamais les cookies du membre. Les clés et `AUTH_COOKIE_SECRET` aléatoire sont chiffrés dans Pages, pas dans les sources ou les assets navigateur.

Le serveur vérifie l’identité par `auth.getUser()`, refuse les comptes anonymes/non confirmés, puis contrôle le `session_id` réel. Les en-têtes entrants `oai-authenticated-*` sont supprimés sur toutes les routes. Les identités Postgres sont les UUID Supabase vérifiés ; `accountRef` conserve le préfixe `supabase:` pour isoler le stockage local. Aucune fusion par adresse e-mail.

Les rôles du nouveau backend proviennent de `private.admin_roles`. Aucun compte administrateur n’est créé automatiquement et `user_metadata` ne donne aucun privilège. L’ancien adaptateur utilise encore sa liste d’UUID serveur ; ses API ne sont pas activées par la présence d’un rôle Postgres.

## Retours Auth enregistrés

| Réglage | Valeur |
| --- | --- |
| Site URL et origine Momento | `https://momento-7se.pages.dev` |
| Connexion/confirmation | `https://momento-7se.pages.dev/api/auth/callback` |
| Récupération | `https://momento-7se.pages.dev/api/auth/recovery/callback` |
| Retour Google à renseigner dans son client Web | `https://yhtngbkjqffkhfjadjzp.supabase.co/auth/v1/callback` |

Ces deux retours Momento exacts sont enregistrés dans Supabase, sans wildcard. Le retour Google est différent de celui de l’application. Une origine de prévisualisation exige un environnement de test distinct ; ne pas autoriser toutes les URL `*.pages.dev`.

Pour Google : préparer un client OAuth **Web application** nommé Momento, origine JavaScript de l’application, retour Supabase ci-dessus et seulement `openid`, e-mail et profil. Les champs Client IDs/Client Secret du fournisseur Google Supabase sont encore vides. Les renseigner dans le tableau de bord, jamais dans le chat ni le dépôt. Garder les vérifications de nonce et l’exigence d’e-mail. `AUTH_OAUTH_PROVIDERS=google` et l’état réel du fournisseur contrôlent l’affichage du bouton ; aucun faux bouton fonctionnel.

Pour le mode confirmed uniquement : configurer un expéditeur SMTP de production et ses protections DNS, confirmer les adresses et installer les modèles de confirmation/récupération avec `{{ .ConfirmationURL }}`. Le service de démonstration Supabase ne constitue pas l’infrastructure d’envoi d’une ouverture publique. Après essais réels, activer `AUTH_EMAIL_ENABLED=true` et `AUTH_EMAIL_DAILY_BUDGET=20`. Cette activation n’a pas été effectuée.

## Parcours Auth implémentés

| Route | Fonction |
| --- | --- |
| `POST /api/auth/oauth` | Démarrage OAuth PKCE pour un fournisseur réellement activé |
| `POST /api/auth/email/signup` | Inscription immédiate en basic, confirmation en confirmed ; mot de passe de 12 à 64 caractères et 72 octets maximum |
| `POST /api/auth/email/resend` | Nouveau lien et défi PKCE sans réutiliser le mot de passe |
| `POST /api/auth/email/signin` | Session fournisseur et mot de passe, adresse non vérifiée en basic ; erreur générique sans divulgation du compte |
| `GET /api/auth/callback` | Échange PKCE serveur ; refuse un flux de récupération sur ce retour ordinaire |
| `POST /api/auth/email/recover` | Acquittement générique et intention signée liée au navigateur/adresse |
| `GET /api/auth/recovery/callback` | Vérifie intention, défi, type et adresse ; autorisation liée à l’UUID et à la session |
| `POST /api/auth/email/password` | Consomme l’autorisation une fois, modifie le mot de passe et demande une déconnexion globale |
| `POST /api/auth/logout` | Révocation de la session et effacement des cookies locaux |

Les cookies sont `__Host-`, Secure, HttpOnly, SameSite=Lax ; aucun JWT/refresh token dans localStorage ou réponse JSON. Mutations avec Origin et marqueur CSRF, corps JSON borné, redirections fixées côté serveur. Les mots de passe ne sont pas enregistrés par Momento et sont effacés des formulaires après soumission.

Les liens sont liés au navigateur d’origine et valables dix minutes côté Momento ; l’autorisation de modification dure quinze minutes. Une insertion unique dans `private.rate_limits` empêche le rejeu, y compris concurrent. Une erreur explicite de mot de passe insuffisant permet la correction ; une issue incertaine impose un nouveau lien. Une révocation globale non confirmée reste signalée par l’interface.

Les compteurs utilisent des HMAC : pas d’e-mail, d’IP ou de mot de passe en clair. Envois : un par minute et trois par heure/adresse, cinq par heure/IP, budget quotidien partagé entre inscription/renvoi/récupération. Connexions : dix par quinze minutes/adresse et vingt/IP. Les RPC de compteur et de récupération sont réservés au rôle serveur ; les membres ne peuvent ni les appeler ni s’accorder un crédit. Les protections natives Supabase doivent aussi être configurées avant ouverture : un client direct ne passe pas nécessairement par le Worker.

## Session et accès aux données

Une déconnexion ne rend pas à elle seule un JWT copié cryptographiquement invalide. Le Worker vérifie donc l’existence et l’échéance de la session. Postgres applique aussi `private.has_active_session()` dans les politiques restrictives et les RPC sensibles. Les médias sont accessibles uniquement par le Worker, après contrôle de session et d’autorisation ; aucune politique membre ne permet un téléchargement direct Storage. Un ancien JWT ne doit pas retrouver les données en contournant Momento par la Data API. Une seule nouvelle tentative est permise pour une erreur temporaire du contrôle de session en lecture ; aucun compteur ou autre mutation n’est rejoué automatiquement.

Les profils restent privés et les écritures autorisées sont limitées. `save_profile` dérive l’acteur d’`auth.uid()`, valide majorité déclarée/prénom/ville et conserve le consentement de confidentialité. La démonstration reste locale et séparée. Les écrans de catalogue, amis et invitations utilisent les données persistantes et les contrôles de consentement/blocage du serveur.

## Images, export et suppression

Le bucket `momento-media` est privé et limité aux JPEG, un Mio maximum. Le Worker retire les métadonnées et contrôle format, taille et dimensions avant upload avec la clé serveur. Les objets ont un chemin lié à l’UUID ; les téléchargements et téléversements directs Storage sont refusés aux membres. Le Worker lit une référence propriétaire sous RLS puis sert l’image avec un contrôle de session et sans cache ; les uploads passent par le nettoyage JPEG. La photo d’un interlocuteur exige une rencontre active ou un match autorisé, sans blocage ni suspension. Aucun lien public permanent ou liste de photos n’est créé.

L’export `/api/me/export` utilise le client RLS du membre pour les tables personnelles. Il refuse une réponse atteignant 500 lignes dans une table ou dépassant deux Mio, afin d’éviter une troncature silencieuse ; les exports volumineux et la restitution complète des médias restent à industrialiser avant ouverture publique.

`DELETE /api/me` ferme le profil, retire les images de son répertoire puis supprime l’identité Supabase Auth et ses données liées. Les cookies sont effacés après réussite. Une étape échouée ne déclenche pas un faux message de succès : le compte reste fermé aux rencontres et la suppression peut être reprise depuis la connexion. Les identités externes Google/ChatGPT ne sont pas supprimées. Les imports interrompus et délais de sauvegardes doivent aussi disposer d’un suivi/purge avant ouverture publique.

## Vérifications et lancement

La suite locale comprend **153 tests**, avec rejeu des schémas et migrations dans PGlite, règles d’accès/quota, API Auth simulée, DOM et compte Postgres/Storage. Les scripts SQL ont aussi été exécutés sur le projet distant avec identités synthétiques et rollback. Ils ne valident pas Google, la délivrabilité, un appel vidéo ou un appareil réel.

`scripts/verify-supabase-accounts.mjs` teste le Worker compilé contre les vrais services Auth/Postgres/Storage avec deux comptes jetables confirmés administrativement, sans envoyer d’e-mail. Exécution explicite : `node scripts/verify-supabase-accounts.mjs --allow-disposable-accounts --env-file <fichier-json-prive>`. Ce fichier fournit les variables serveur usuelles et ne doit jamais être versionné. Le résultat réel et les éventuelles limites sont consignés dans [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md).

Avant lancement : parcours retenu validé (basic sans SMTP, ou confirmed avec SMTP), protections fournisseur et anti-abus, appels et ordonnanceur, matchs/messages et boutique, modération et droits payants, purge/restauration, identité et contact de l’exploitant, puis essais Safari iOS/Chrome Android. Les drapeaux de sessions, vidéo, juridique et paiements restent fermés.

Références : [Google Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [sessions](https://supabase.com/docs/guides/auth/sessions), [clés modernes](https://supabase.com/docs/guides/api/api-keys), [sécuriser Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Mode simple sans SMTP — préparé le 20 octobre

`AUTH_EMAIL_MODE=basic` sélectionne un parcours immédiat. Il n’est offert que si Pages active l’e-mail et que Supabase publie `external.email=true` et `mailer_autoconfirm=true`. Un réglage inconnu ou incohérent ferme le parcours. Les routes de confirmation, renvoi, récupération et changement via lien sont refusées ; aucun message de confirmation/récupération n’est promis. L’interface explique l’absence de vérification d’adresse et de récupération. Google/SMS ne sont pas proposés quand leurs paramètres sont désactivés.

La documentation Supabase précise que PKCE ne se combine pas avec autoconfirm. L’inscription simple utilise donc un client temporaire **à clé publiable**, sans persistance/auto-refresh, avec `flowType=implicit` et sans URL de retour. Le résultat reste exclusivement serveur : le client SSR importe la session dans les cookies HttpOnly, vérifie l’utilisateur auprès d’Auth et le contrôle de session actif demeure requis. Aucun token n’est renvoyé au navigateur. La réponse signale `emailVerified=false` : la date auto-confirmée du fournisseur ne prouve pas la propriété de l’adresse. Les contrôles de mot de passe, CSRF et quotas d’inscription restent appliqués. Aucun accès administrateur ou rapprochement de comptes par e-mail n’est introduit.

**Configuration Supabase effectuée, ouverture Pages bloquée** : `mailer_autoconfirm=true` est enregistré, le minimum natif de 12 caractères vérifié par un refus HTTP 422 pour 11 caractères. Deux inscriptions immédiates avec profil, relations et suppression ont réussi contre les vrais services, sans e-mail/SMS ; toutes les fixtures sont supprimées. Le contrôle automatique a refusé `AUTH_EMAIL_ENABLED=true` dans Cloudflare, en considérant encore applicable l’attente d’un domaine d’expéditeur. La variable reste false : une confirmation explicite de l’ouverture sans confirmation d’adresse ni récupération par e-mail est requise. Ne pas contourner le refus. Google et SMTP ne sont pas des prérequis techniques de basic. Les rencontres et ventes restent fermées.
