# Momento

Application de rencontres audio/vidéo, sources **TbhX/momento**, déployée avec **Cloudflare Pages** : [momento-7se.pages.dev](https://momento-7se.pages.dev/). Le propriétaire a rendu le dépôt public pour connecter Cloudflare. La marque affichée dans l’application reste Momento.

La version autonome ne demande aucun compte ChatGPT. **La page est déployée, mais les comptes et rencontres réelles ne sont pas encore ouverts** : Google/SMTP et le portage des API métier restent à terminer ; les nouveaux salons restent des simulations. Le projet Supabase dédié **Momento** est créé en offre Free, à Paris, avec ses 27 tables protégées par RLS et vérifiées à distance. Les paramètres de connexion serveur sont enregistrés dans Pages. Les preuves et limites figurent dans [SUPABASE_SETUP.md](SUPABASE_SETUP.md). La liste courante des travaux et critères de lancement est dans [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md) ; [LAUNCH_READINESS.md](LAUNCH_READINESS.md) conserve les validations et limites historiques.

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
| Supabase Database | Projet dédié `yhtngbkjqffkhfjadjzp`, schéma installé et tests SQL distants réussis ; portage des API métier encore nécessaire |
| Cloudflare D1, binding `DB` | Données métier et limites serveur |
| Cloudflare R2 privé, binding `BUCKET` | Profils et images |
| Pages, binding automatique `ASSETS` | Pages et fichiers statiques |
| LiveKit | Appels vidéo, après validation réelle |
| Stripe | Paiements de test ; ventes réelles désactivées |

L’installation du schéma Supabase **ne migre pas les API ni les données D1/R2 vers Supabase Database/Storage**. Ce portage explicite est la prochaine étape de persistance ; les bindings D1/R2 du Worker ne sont actuellement pas configurés sur Pages.

Le Worker actuel exigerait les bindings D1/R2 et les migrations `drizzle/` appliquées dans D1 ; elles ne s’exécutent pas lors du build. La cible retenue nécessite leur portage vers le projet Supabase dédié. Le stockage du prototype Sites ne devient pas automatiquement celui de Pages. `deploy/pages.example.jsonc` donne un modèle optionnel ; la configuration réelle n’est pas versionnée par défaut.

L’origine HTTPS exacte (`MOMENTO_APP_ORIGIN`), l’URL Supabase (`SUPABASE_URL`), la clé publiable moderne et le secret de cookies sont enregistrés dans Pages. Aucun administrateur réel n’est créé automatiquement. [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md) décrit les fournisseurs, les redirections et les limites avant ouverture.

L’inscription e-mail, la confirmation et son renvoi, la connexion et la récupération du mot de passe sont implémentés. Ils exigent `AUTH_EMAIL_ENABLED=true`, le secret serveur, le compteur D1 et la confirmation d’adresse activée dans Supabase. Ils restent **désactivés** sans configuration et validation réelle. Les modèles prêts à configurer sont dans `supabase/templates/`. La suite actuelle comporte 130 tests réussis, avec rejeu du schéma déclaratif et des migrations ; les tests Auth/SMTP simulés et DOM ne prouvent pas l’envoi réel ni une validation sur téléphone.

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
