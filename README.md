# Momento

Application de rencontres audio/vidéo, sources **TbhX/momento**, déployée avec **Cloudflare Pages** : [momento-7se.pages.dev](https://momento-7se.pages.dev/). Le propriétaire a rendu le dépôt public pour connecter Cloudflare. La marque affichée dans l’application reste Momento.

La version autonome ne demande aucun compte ChatGPT. **La page est déployée, mais l’inscription et les rencontres réelles restent fermées**. Le propriétaire a choisi de commencer par e-mail et mot de passe ; le mode sans SMTP est réglé et testé côté Supabase. Son ouverture dans Pages a été refusée par le contrôle automatique ; AUTH_EMAIL_ENABLED reste false jusqu’à confirmation explicite pour ouvrir sans confirmation ni récupération par e-mail. Google est reporté. Les comptes, profils, consentements, photos et arrière-plans privés utilisent désormais Supabase ; le catalogue des salons, les amis et invitations sont maintenant persistants. Les appels, admissions et achats réels restent fermés ; la démonstration est un parcours explicite séparé. Le projet dédié **Momento** est en Free à Paris, avec 27 tables protégées par RLS. Les paramètres serveur sont enregistrés dans Pages. Les preuves et limites figurent dans [SUPABASE_SETUP.md](SUPABASE_SETUP.md). La liste courante des travaux est [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md) ; [LAUNCH_READINESS.md](LAUNCH_READINESS.md) conserve aussi l’historique.

## Installation et contrôle

Node.js 22 minimum ; pnpm 11.25.0, indiqué dans `packageManager` et verrouillé dans `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build:pages
```

La sortie Pages est **`pages-dist`**. Elle contient les pages, les assets, un `_worker.js` serveur et un `_routes.json`. Elle ne doit pas être remplacée par un export HTML seul : les API de compte, authentification, images et paiement sont servies par le Worker.

## Connexion GitHub → Cloudflare Pages

| Réglage Pages | Valeur |
| --- | --- |
| Dépôt | `TbhX/momento` |
| Framework preset | None |
| Branche de production | `main` |
| Root directory | Racine du dépôt |
| Build command | `pnpm test && pnpm run build:pages` |
| Build output directory | `pages-dist` |
| Variable de build `NODE_VERSION` | `22` |
| Variable de build `PNPM_VERSION` | `11.25.0` |

Le projet Pages `momento` a été créé avec ces réglages et son premier déploiement a réussi. L’origine serveur est `https://momento-7se.pages.dev`. Après autorisation GitHub, les push sur la branche de production déclenchent un build et un déploiement Pages. Une erreur de test interrompt la commande avant compilation. Aucun jeton Cloudflare n’est nécessaire dans le dépôt pour ce flux. Les prévisualisations automatiques sont désactivées tant qu’un environnement distinct n’est pas configuré.

Les mises à jour demandées sont à tester, committer et pousser avec le connecteur GitHub autorisé. Ne pas confondre le dépôt de source Sites avec ce dépôt GitHub. Un dépôt privé est compatible avec Pages à condition d’autoriser son accès dans l’application GitHub Cloudflare Workers and Pages ; le mode public n’est pas une obligation technique.

L’accès de l’application **Cloudflare Workers and Pages** au dépôt **Momento** a été enregistré le 20 octobre 2026, avec l’accord du propriétaire. Les déploiements de production sont configurés sur `main`. Vérifier le résultat du build Cloudflare après chaque mise à jour.

## Services à connecter

| Service | Usage actuel de la cible autonome |
| --- | --- |
| Supabase Auth | OAuth et e-mail/mot de passe implémentés ; Google et e-mail prioritaires, fournisseurs réels à configurer ; SMS désactivé |
| Supabase Database | Profils, consentements, références d’images, compteurs Auth, autorisations de récupération et statut du compte |
| Supabase Storage | Bucket `momento-media` privé, JPEG nettoyés, téléchargement propriétaire ou interlocuteur autorisé |
| D1/R2 historiques | Adaptateurs du prototype conservés ; services non portés fermés sur Pages |
| Pages, binding automatique `ASSETS` | Pages et fichiers statiques |
| LiveKit | Appels vidéo, après validation réelle |
| Stripe | Paiements de test ; ventes réelles désactivées |

`SUPABASE_DATA_ENABLED=true` sélectionne les routes de compte Postgres/Storage ; il exige la clé moderne serveur `SUPABASE_SECRET_KEY`, distincte du client à cookies. Les lectures de profil et les écritures autorisées utilisent le JWT du membre et RLS. La clé privilégiée est réservée aux opérations serveur contrôlées : compteurs, vérification de session, écriture de JPEG nettoyés et suppression de l’identité. Aucun repli D1/R2 n’a lieu dans ce mode.

Le catalogue, les amis/demandes, invitations, blocages et signalements sont portés ; les matchs, messages, médias de session et paiements restent à terminer. Elles refusent les actions non implémentées au lieu d’appeler une D1 non configurée. Le statut vient de Postgres ; les sessions et paiements réels restent fermés. Aucune donnée du prototype Sites n’est importée ni fusionnée par e-mail. `deploy/pages.example.jsonc` décrit la cible de compte actuelle sans bindings D1/R2.

L’origine HTTPS exacte, l’URL Supabase, les deux clés modernes et le secret de cookies sont enregistrés côté serveur Pages. Les secrets sont chiffrés et ne figurent pas dans le code navigateur. Aucun administrateur réel n’est créé automatiquement : les rôles du nouveau backend proviennent de `private.admin_roles`. [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md) décrit les fournisseurs et les limites avant ouverture.

L’inscription e-mail, la confirmation/renvoi et la récupération sont implémentés avec compteurs Postgres et autorisation à usage unique. `AUTH_EMAIL_ENABLED` reste **false** : le propriétaire n’a pas encore de domaine d’expéditeur et aucun SMTP de production n’est configuré. Les modèles sont dans `supabase/templates/`. Google est préparé avec les retours exacts ; son client reste à créer/configurer. La suite comporte **153 tests** ; les essais sur appareils et la délivrabilité restent à valider.

La révocation des sessions est vérifiée par le Worker **et** dans les politiques/RPC Postgres. Les membres ne disposent d’aucun accès direct à Storage ; toutes les images passent par le Worker après autorisation. Un JWT copié ne doit pas retrouver les données via la Data API après déconnexion. La suppression ferme d’abord le profil, retire les images puis l’identité Auth ; une suppression interrompue peut être reprise depuis l’écran de compte. L’export JSON applique RLS et refuse les exports trop volumineux plutôt que les tronquer. Ces protections ont aussi été vérifiées contre les vraies API avec deux comptes jetables, supprimés après essai.

## Secrets et environnements

Aucune clé réelle dans GitHub, dans les pages ou dans le bundle navigateur. Les variables de connexion et secrets fournisseur se configurent dans Pages/Supabase. Ne pas importer `.env`, `.dev.vars`, exports de données ou identifiants personnels. Les sorties de compilation et `node_modules` sont ignorés par Git pour les nouveaux fichiers.

Les aperçus de branches doivent utiliser une configuration et des données de test séparées, avec une origine et des redirections adaptées. Les secrets et données de production ne sont pas destinés aux builds de PR externes. Ne pas autoriser automatiquement toutes les URL `*.pages.dev` comme retours OAuth.

Aucune application native, vente réelle ni session publique n’est activée par le déploiement de cette page.

## Suivi quotidien

Une tâche est activée chaque matin vers 8 h, heure de Paris, à partir du 21 octobre 2026, pour les améliorations vérifiées, leur déploiement GitHub/Cloudflare et le projet Supabase dédié Momento. Le propriétaire a autorisé les push de routine ; les résultats et blocages doivent être consignés dans [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md). Cette tâche ne remplace pas les accès externes manquants ni les validations nécessaires à l’ouverture publique.

## Autres cibles

- `pnpm run build:production` : Worker autonome classique, `production-dist/worker.js` et assets séparés.
- `pnpm run build` : même sortie Cloudflare Pages que `build:pages`. L’ancien prototype Sites conserve séparément sa configuration et son audience privées.

Documentation : [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [configuration Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

## Inscription simple choisie pour commencer

`AUTH_EMAIL_MODE=basic` prépare une création immédiate avec adresse et mot de passe, sans lien envoyé ni redirection OAuth. Une session serveur HttpOnly permet ensuite de créer le profil. Les mots de passe restent gérés par Supabase Auth. Le formulaire annonce l’absence de vérification de l’adresse et de récupération par e-mail ; conserver son mot de passe est nécessaire. Aucun compte n’est fusionné à partir de l’adresse et aucun rôle ne lui est attribué.

Ce mode exige un réglage Supabase distinct : confirmation e-mail désactivée (`mailer_autoconfirm=true`). Le serveur refuse les inscriptions si les réglages ne correspondent pas ; il ne contourne pas la vérification avec une clé administrateur. Ce réglage Supabase est enregistré et le parcours réel a été testé. `AUTH_EMAIL_ENABLED=false` reste en place à la suite du refus du contrôle automatique, jusqu’à confirmation explicite de l’ouverture sans e-mail de confirmation/récupération. Le mode `confirmed` et les modèles restent disponibles pour ajouter SMTP et récupération ultérieurement.

## Accueil et parcours harmonisés

L’accueil public présente le concept, les thèmes, Gratuit/Premium, les rencontres physiques à venir et les réponses aux questions courantes. Il reste accessible sans compte ; les salons et espaces membre exigent toujours une inscription et un profil complet. La navigation mobile/ordinateur, les titres et liens internes sont communs. Les parcours métier encore fermés affichent leur état de préparation au lieu d’erreurs techniques répétées.

Les portraits illustratifs sont fournis localement. Les pages profil, liens, invitations, boutique, confidentialité et erreur suivent la même identité Momento. Les informations de lancement distinguent les comptes persistants des simulations locales et des rencontres non ouvertes. Le choix e-mail/mot de passe reste inchangé : aucune activation Auth n’est introduite par cette mise à jour visuelle.


## Dernière livraison et déploiement

Communauté persistante publiée dans le commit `c4dc3071746cda5f6b0ad8547a3f29a950f43161` : catalogue et aperçu, amis et consentements, invitations audio/vidéo, blocages et signalements. 153 tests, build Pages, trois scripts SQL distants à rollback et quatre contrôles API réels réussis avec deux comptes jetables, tous nettoyés. Ce résultat ne valide ni un appel réel ni HTTP Pages de bout en bout. La confirmation du dernier déploiement est bloquée : le connecteur Cloudflare renvoie une erreur interne, y compris pour son contrôle d’identité. Le push GitHub est vérifié, le succès du déploiement ne doit pas être supposé.
