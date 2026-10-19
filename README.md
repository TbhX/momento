# Momento

Application de rencontres audio/vidéo, hébergée dans le dépôt GitHub privé **TbhX/momento** et un hébergement **Cloudflare Pages**. La marque affichée dans l’application reste Momento.

La version autonome ne demande aucun compte ChatGPT. **Cette base n’est pas encore une application de rencontres ouverte au public** : les nouveaux salons restent des simulations, et les fournisseurs réels sont à configurer. L’état détaillé est dans [LAUNCH_READINESS.md](LAUNCH_READINESS.md).

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

Créer le projet Pages en choisissant l’intégration GitHub, puis autoriser le dépôt. Après configuration, chaque push sur la branche de production déclenche un build et un déploiement Pages. Une erreur de test interrompt la commande avant compilation. Aucun jeton Cloudflare n’est nécessaire dans le dépôt pour ce flux.

Les mises à jour peuvent être poussées par le connecteur GitHub une fois que le dépôt lui est accessible et que ses droits d’écriture sont confirmés. Ne pas confondre le dépôt privé de source Sites avec ce nouveau dépôt GitHub. Le dépôt a été créé par son propriétaire, puis passé en privé avant ce transfert. Les futures modifications demandées sont à tester, committer et pousser sur ce dépôt, avec les droits d’écriture déjà autorisés.

## Services à connecter

| Service | Usage actuel de la cible autonome |
| --- | --- |
| Supabase Auth | Identité : Google, Apple, Facebook et SMS, selon fournisseurs activés |
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

Le dépôt doit être privé lors du transfert initial, conformément au choix par défaut de cette préparation. Aucune application native, vente réelle ni session publique n’est activée par la création du dépôt.

## Autres cibles

- `pnpm run build:production` : Worker autonome classique, `production-dist/worker.js` et assets séparés.
- `pnpm run build` : même sortie Cloudflare Pages que `build:pages`. L’ancien prototype Sites conserve séparément sa configuration et son audience privées.

Documentation : [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [configuration Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
