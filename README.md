# Momento

Application de rencontres audio/vidéo pensée pour le mobile, avec une interface utilisable sur ordinateur. Les utilisateurs disposent de comptes Momento indépendants ; aucun compte ChatGPT ou Cloudflare ne leur est demandé.

## Gestion des utilisateurs

Supabase Auth gère l’inscription, la connexion par e-mail et mot de passe et les sessions. Les profils et médias privés sont reliés aux comptes Supabase.

Cette livraison retire le double interrupteur d’activation de l’e-mail : le site suit désormais les réglages utilisateurs de Supabase. Fermer les nouvelles inscriptions laisse les membres existants se connecter. Si les réglages sont indisponibles ou incohérents, aucune création n’est autorisée. L’accueil et le formulaire affichent la disponibilité correspondante.

Le démarrage utilise un compte par adresse et mot de passe, sans vérification de l’adresse ni récupération par e-mail. Cette limite est affichée dans le formulaire. Google et SMS sont reportés.

## Développement

Node.js 22 minimum et pnpm selon la version verrouillée dans `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build:pages
```

Le build Pages produit `pages-dist` avec les fichiers du site et son Worker. Les paramètres sensibles restent dans les services ; aucun secret ou export personnel ne doit être ajouté au dépôt.

## Vérifications et disponibilité

168 tests locaux réussis et build Pages réussi pour cette livraison. Le formulaire public d’inscription est ouvert. Le compte synthétique du précédent essai a été supprimé après autorisation. Une identité organisateur a été préparée via Auth ; sa session provisoire est révoquée. Le propriétaire choisit lui-même son mot de passe avec un code privé à usage unique, puis complète son profil.

L’espace organisateur propose les compteurs, une file de signalements paginée, leur prise en charge et classement, ainsi que suspension et rétablissement des profils par un administrateur. Les actions sont enregistrées. Les parcours de test Gratuit/Premium utilisent des profils fictifs et ne créent aucun abonnement.

Les profils, médias, catalogue de salons, amis, invitations, blocages et signalements disposent de données persistantes. Les appels réels, rotations, messages, gestion complète des salons, exploitation et paiements restent à finaliser. Les rencontres publiques et ventes restent fermées. Les rencontres physiques restent un aperçu futur. La vérification du déploiement courant et les appareils physiques sont suivis séparément.

Voir [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md), [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md) et [LAUNCH_READINESS.md](LAUNCH_READINESS.md). Les détails opérationnels d’infrastructure sont conservés dans le suivi privé du projet.
