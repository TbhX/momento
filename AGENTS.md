# Momento — développement et publication

Le dépôt de référence est `TbhX/momento`, branche `main`. Le propriétaire l’a rendu public le 20 octobre 2026 pour la connexion Cloudflare ; préserver son choix de visibilité. Il a autorisé les commits et push des mises à jour demandées, après vérification. Utiliser le connecteur GitHub disponible ; ne pas remplacer ce dépôt par celui du prototype Sites ni modifier VOLTÉO.

Pour une modification de code, exécuter les tests pertinents et le build Pages avant de committer et pousser. La commande de validation complète est `pnpm test && pnpm run build:pages`. Pour des documents seulement, une relecture et un contrôle du diff suffisent. Préserver les changements du propriétaire ; aucun force-push. Si la branche refuse un push, préparer une PR et expliquer le blocage.

Cloudflare Pages attend `pages-dist`, avec `_worker.js`. Le code serveur vérifie Supabase Auth et conserve actuellement les données métier dans D1/R2. La présence de Supabase ne signifie pas que toutes les données ont été migrées vers Postgres. Ne pas annoncer les salons simulés, les paiements réels ou les fournisseurs de connexion comme opérationnels sans les avoir validés.

Le projet Pages `momento` est déployé sur `https://momento-7se.pages.dev/`. L’organisation Supabase `Momento` est créée en Free, mais le projet/base est bloqué par le quota global de projets gratuits. Le connecteur Supabase ne voit encore que Volteo : ne pas y appliquer le schéma Momento. `supabase/schemas/` contient l’état déclaratif préparé et testé localement, pas une base distante déjà créée. Voir `SUPABASE_SETUP.md` avant toute application.

Les secrets restent dans les paramètres serveur Cloudflare/Supabase. Ne jamais versionner de clé réelle, `.env`, `.dev.vars`, export de données personnelles ou sortie de compilation. Le fichier `deploy/pages.example.jsonc` est un modèle à compléter, pas une configuration de production déjà active.
