# Momento

Application de rencontres audio/vidéo, sources **TbhX/momento**, déployée avec **Cloudflare Pages** : [momento-7se.pages.dev](https://momento-7se.pages.dev/). Le propriétaire a rendu le dépôt public pour connecter Cloudflare. La marque affichée dans l’application reste Momento.

La version autonome ne demande aucun compte ChatGPT. **La page est accessible, mais les comptes et rencontres réelles ne sont pas encore ouverts** : Supabase Auth et les stockages restent à connecter, les nouveaux salons restent des simulations. L’organisation Supabase Momento a été créée ; le connecteur refuse encore l’accès nécessaire à son projet. Le quota, qui avait aussi bloqué la création, reste à revérifier après correction de cet accès. Son schéma préparé est décrit dans [SUPABASE_SETUP.md](SUPABASE_SETUP.md). La liste courante des travaux et critères de lancement est dans [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md) ; [LAUNCH_READINESS.md](LAUNCH_READINESS.md) conserve les validations et limites historiques.

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
| Supabase Auth | OAuth préparé ; Google et e-mail/mot de passe prioritaires, parcours mot de passe à implémenter ; SMS désactivé |
| Cloudflare D1, binding `DB` | Données métier et limites serveur |
| Cloudflare R2 privé, binding `BUCKET` | Profils et images |
| Pages, binding automatique `ASSETS` | Pages et fichiers statiques |
| LiveKit | Appels vidéo, après validation réelle |
| Stripe | Paiements de test ; ventes réelles désactivées |

L’ajout de Supabase **ne migre pas encore les données D1/R2 vers Supabase Database/Storage**. Cette migration serait un chantier distinct. Aucun projet Supabase existant n’est réutilisé par supposition.

Configurer les bindings D1/R2 dans Pages et appliquer les migrations `drizzle/` dans cette D1. Elles ne s’exécutent pas lors du build. Le stockage du prototype Sites ne devient pas automatiquement celui de Pages. `deploy/pages.example.jsonc` donne un modèle optionnel ; le copier et le remplir seulement après identification du projet. La configuration réelle n’est pas versionnée par défaut.

Configurer dans Pages l’origine HTTPS exacte (`MOMENTO_APP_ORIGIN`), l’URL du projet Supabase (`SUPABASE_URL`), les identifiants administrateurs et les secrets requis. [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md) décrit les fournisseurs, les redirections, les cookies et les limites avant ouverture.

## Secrets et environnements

Aucune clé réelle dans GitHub, dans les pages ou dans le bundle navigateur. Les variables de connexion et secrets fournisseur se configurent dans Pages/Supabase. Ne pas importer `.env`, `.dev.vars`, exports de données ou identifiants personnels. Les sorties de compilation et `node_modules` sont ignorés par Git pour les nouveaux fichiers.

Les aperçus de branches doivent utiliser une configuration et des données de test séparées, avec une origine et des redirections adaptées. Les secrets et données de production ne sont pas destinés aux builds de PR externes. Ne pas autoriser automatiquement toutes les URL `*.pages.dev` comme retours OAuth.

Aucune application native, vente réelle ni session publique n’est activée par le déploiement de cette page.

## Suivi quotidien

Une tâche est activée chaque matin vers 8 h, heure de Paris, à partir du 21 octobre 2026, pour les améliorations de code vérifiées et leur déploiement GitHub/Cloudflare. Le propriétaire a autorisé les push de routine ; les résultats et blocages doivent être consignés dans [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md). Cette tâche ne remplace pas les accès externes manquants ni les validations nécessaires à l’ouverture publique.

## Autres cibles

- `pnpm run build:production` : Worker autonome classique, `production-dist/worker.js` et assets séparés.
- `pnpm run build` : même sortie Cloudflare Pages que `build:pages`. L’ancien prototype Sites conserve séparément sa configuration et son audience privées.

Documentation : [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [configuration Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
