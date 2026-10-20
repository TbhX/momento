# Base Supabase Momento

L’organisation **Momento** a été créée en offre Free le 20 octobre 2026. **Aucun projet/base Momento n’a été créé par nos tentatives.** La création avait été bloquée par la limite de projets gratuits actifs sur l’ensemble du compte. Le propriétaire indique maintenant que Supabase est prêt ; la disponibilité réelle de l’emplacement reste à vérifier, car l’accès connecté à Momento est encore refusé.

Le schéma ci-dessous est préparé et testé dans un Postgres embarqué PGlite. Il n’a pas été appliqué à Volteo. Le connecteur Supabase ne voit actuellement que l’organisation Volteo. Les opérations de coût et de création sur l’organisation Momento (`ihyvwxutvbldkgsomhcp`) répondent « You do not have permission to perform this action ». Reconnecter Supabase en autorisant Momento et les opérations nécessaires, puis relire la liste de projets avant toute création pour éviter un doublon. Ne pas transmettre de clé dans le chat et ne pas réutiliser Volteo. Voir aussi [les permissions Supabase](https://supabase.com/docs/guides/platform/personal-access-tokens).

## Modèle préparé

| Ensemble | Tables et protections |
| --- | --- |
| Profils et préférences | Profils majeurs, ville, profession, thèmes, préférences privées, consentements et références d’images privées |
| Salons | Capacité de 20 maximum, tranches d’âge, audio/vidéo, durée des tours et pauses, présence temporaire et historique d’entrées |
| Rencontres | Paires, choix privés, matchs réciproques, amis, invitations vidéo et messages |
| Boutique | Produits, commandes, Premium et journal de crédits ; montants entiers en centimes, environnements Stripe test/live séparés |
| Modération | Blocages, signalements, rôles administrateurs privés, audit et compteurs anti-abus |

Les 27 tables activent RLS. Aucun accès anonyme aux données. Le membre lit son profil et ses droits ; il ne peut pas changer son statut, se nommer administrateur, créer un match ou s’accorder Premium/crédits. Les données d’un interlocuteur passent par des accès limités aux participants ou par un aperçu de salon qui respecte les blocages. Les écritures de paiement, choix, messages et modération restent réservées à un serveur qui valide leurs règles métier.

`enter_room` calcule la journée en **Europe/Paris**, verrouille le membre puis le salon, respecte capacité et âge, et applique une entrée gratuite par jour. Quitter ne rend pas l’entrée gratuite. Une entrée supplémentaire consomme un crédit une seule fois ; Premium actif permet des entrées sans plafond quotidien, tout en respectant les règles du salon. Les nouvelles tentatives avec le même identifiant sont idempotentes. La présence expire après deux minutes sans `heartbeat_room`. Un nouvel identifiant de requête est nécessaire pour une véritable nouvelle entrée après sortie.

`seed.sql` crée seulement les thèmes et une configuration en mode test avec **admissions désactivées**. Aucun utilisateur, administrateur, salon fictif publié ou avantage payant n’est créé. Aucun achat réel n’est activé. Les tarifs doivent être raccordés au catalogue validé, pas inventés au déploiement.

## Vérification reproductible

```sh
pnpm install --frozen-lockfile
node --test tests/supabase-schema.test.mjs
pnpm test
pnpm run build:pages
```

Le test utilise `@electric-sql/pglite` **0.5.10**, avec identités et rôles synthétiques. Il exécute le SQL, les politiques et les fonctions : isolation des comptes, refus des auto-promotions, quota quotidien, crédit consommé une fois, expiration Premium, séparation test/live, capacité, aperçu gratuit, blocage réciproque et suspension. Tous les jeux d’essai sont annulés par transaction. Il ne valide pas les services Auth, Storage, Realtime, les webhooks Stripe ni la charge d’un Supabase distant.

## Mise en place quand un emplacement est disponible

1. Corriger l’accès à Momento, puis vérifier la disponibilité et le coût. Le propriétaire indique avoir préparé Supabase ; ne pas conclure que le quota est toujours bloqué ou débloqué sans le relire. Aucune pause, suppression ou souscription n’a été effectuée par l’agent.
2. Créer le projet **Momento** dans l’organisation **Momento**, région Paris (`eu-west-3`), et confirmer son identifiant. Ne pas utiliser les clés ou la base Volteo.
3. Le projet utilise des schémas déclaratifs : modifier `supabase/schemas/`, puis utiliser les commandes disponibles de la CLI pour générer et revoir une migration. Le dossier ne contient encore aucune migration distante appliquée. Contrôler aussi les droits de colonnes et schémas : le diff déclaratif ne suit pas toutes les modifications de privilèges. Appliquer séparément les données de référence de `seed.sql`.
4. Exécuter `supabase/tests/access.sql` seulement sur une base de développement vide du bon projet. La transaction est annulée. Exécuter ensuite les advisors Supabase sécurité/performance et un test Data API avec deux vrais comptes de test.
5. Configurer Supabase Auth et le retour exact `https://momento-7se.pages.dev/api/auth/callback`. Définir dans Pages `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et un secret aléatoire `AUTH_COOKIE_SECRET`. Ne pas copier de secret dans GitHub.
6. **Porter et tester les API métier** : le Worker actuel utilise encore les requêtes SQLite D1 et les objets R2. Le schéma Postgres n’est pas un remplacement automatique de `env.DB`/`env.BUCKET`. Le préfixe d’identité `supabase:<uuid>` du Worker doit être converti explicitement vers les UUID Postgres ; aucune fusion par email.

Le futur serveur doit créer les matchs uniquement après choix réciproques, vérifier les autorisations à chaque message/jeton vidéo et révoquer la vidéo après blocage/suspension. Les ajouts/retraits de crédits doivent prendre le même verrou de profil que les admissions et être idempotents après vérification Stripe côté serveur. Les médias restent privés ; tout accès d’un interlocuteur exige une autorisation serveur et les images doivent conserver le nettoyage des métadonnées. Les rôles d’administration ne proviennent jamais de `user_metadata`. Configurer une durée de JWT et une révocation de session adaptées avant ouverture publique.
