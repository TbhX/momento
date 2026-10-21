# Momento

Application de rencontres audio/vidéo pensée pour le mobile et utilisable sur ordinateur. Les comptes Momento sont indépendants ; aucun compte ChatGPT ou Cloudflare n’est demandé aux utilisateurs.

## Interface

L’application utilise un cadre fixe avec menu latéral et vues centrales. Sur mobile, le menu devient un tiroir accessible au clavier. Les formulaires et listes longs défilent dans leur panneau, sans déplacer le cadre. L’accueil, le concept, les formules et la confidentialité s’ouvrent dans la même application, avec liens directs et retour arrière.

Les transitions rosées respectent la réduction des animations. Les lectures des espaces membre sont parallélisées et seules les requêtes GET encore en cours sont partagées. Aucune réponse privée terminée n’est mise en cache. Le module de conférence est chargé à la demande pour un appel ou un effet vidéo.

## Comptes et fonctionnalités

Supabase Auth gère les comptes par e-mail et mot de passe. Le site suit les réglages natifs d’activation et d’inscription ; fermer les nouveaux comptes laisse les membres existants se connecter. L’adresse n’est pas vérifiée et la récupération par e-mail n’est pas encore disponible. Le formulaire annonce ces limites. Google et SMS sont reportés.

Les profils, médias privés, catalogue, amis, invitations, blocages et signalements disposent de données persistantes. L’administration propose compteurs, signalements paginés, traitement, suspension/rétablissement et historique. Les tests Gratuit/Premium restent des simulations, sans abonnement réel.

Les appels réels, rotations, messages, gestion complète des salons, exploitation et paiements restent à finaliser. Les rencontres publiques et les ventes restent fermées. Le physique reste un aperçu futur. La web-app installable n’est pas encore publiée sur les stores.

## Développement

Node.js 22 minimum et pnpm selon la version verrouillée dans `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build:pages
```

Le build produit `pages-dist` avec le site et son Worker. Les paramètres sensibles restent dans les services ; aucun secret ou export personnel ne doit être ajouté au dépôt.

181 tests locaux et build Pages réussis pour cette livraison. Les tests couvrent notamment les navigations concurrentes, les erreurs, la séparation des comptes, le retour arrière, le clavier, la réduction des animations et le chargement vidéo différé. La validation du code publié et les essais sur appareils sont suivis séparément dans [LAUNCH_READINESS.md](LAUNCH_READINESS.md).

Voir aussi [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md) et [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md). Les détails d’exploitation sont conservés dans le suivi privé.
