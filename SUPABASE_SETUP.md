# Base Supabase Momento

Le projet dédié [**Momento**](https://supabase.com/dashboard/project/yhtngbkjqffkhfjadjzp) est créé dans l’organisation Momento (`ihyvwxutvbldkgsomhcp`), en offre **Free**, région **Paris `eu-west-3`**. Référence du projet : **`yhtngbkjqffkhfjadjzp`**. Son état `ACTIVE_HEALTHY` et PostgreSQL 17.11 ont été vérifiés le 20 octobre 2026. Le devis de création était de 0 ; aucun passage à une offre payante n’a été effectué.

Le remplacement de l’autorisation du plugin a débloqué l’accès à cette organisation. Le schéma ci-dessous est installé dans ce projet et testé localement ainsi qu’à distance. Volteo n’a pas été modifié. Ne pas créer un deuxième projet, réutiliser une autre base ou transmettre de secret dans le chat.

## Modèle installé

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

Les tests utilisent `@electric-sql/pglite` **0.5.10**, avec identités et rôles synthétiques, sur deux bases neuves : état déclaratif d’une part, migrations versionnées d’autre part. Ils exécutent le SQL, les politiques et les fonctions : isolation des comptes, refus des auto-promotions, quota quotidien, crédit consommé une fois, expiration Premium, séparation test/live, capacité, aperçu gratuit, blocage réciproque et suspension. Tous les jeux d’essai sont annulés par transaction. Ils ne valident pas les services Auth, Storage, Realtime, les webhooks Stripe ni la charge d’un Supabase distant.

## Preuves distantes du 20 octobre 2026

- La base et l’historique étaient vides avant installation. La migration `initial_momento_schema`, version **`20261020075203`** attribuée par Supabase, est appliquée. Son SQL exact est archivé dans `supabase/migrations/20261020075203_initial_momento_schema.sql` ; empreinte SHA-256 `e2ade3824a104fd2f1179f3ae7ed89034c9b4ea5e255942573a1088fe13eff2b`.
- La première migration reprend les deux fichiers déclaratifs relus et testés, appliqués par le connecteur natif sur ce projet vide. La CLI et Docker n’étaient pas disponibles ; aucun diff CLI n’est revendiqué. Les données de référence de `seed.sql` ont été appliquées séparément : sept thèmes, environnement test et admissions désactivées.
- `supabase/tests/access.sql` a réussi sur PostgreSQL distant avec identités synthétiques et changements de rôle. Après `rollback`, zéro utilisateur Auth, profil ou salon ; 27 tables sur 27 avec RLS, sept thèmes et admissions toujours désactivées. Ce test ne constitue pas un parcours Auth avec de vrais comptes.
- La Data API refuse une lecture anonyme de `profiles` : HTTP **401**, code Postgres **42501**, aucune donnée retournée. Aucun compte réel ni message e-mail n’a été créé par ces vérifications.
- Les advisors base sécurité/performance n’ont renvoyé ni `WARN` ni `ERROR`. Les cinq remarques [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) sont de niveau `INFO` et concernent les tables `private` volontairement fermées aux membres, réservées aux opérations serveur. Les 26 [index encore inutilisés](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) sont aussi informatifs sur cette base neuve ; ne pas retirer les index de sécurité/relations en l’absence de trafic représentatif.

## Configuration enregistrée et suite

1. **Pages configuré côté serveur** : `SUPABASE_URL`, clé moderne `SUPABASE_PUBLISHABLE_KEY` et `AUTH_COOKIE_SECRET` aléatoire. Les deux dernières valeurs sont chiffrées dans Pages ; aucune clé `service_role` ou d’administration Auth n’est ajoutée. Les secrets Pages masqués ne doivent jamais être remplacés par une chaîne vide lors d’une mise à jour.
2. **Auth reste à finaliser** : la lecture réelle de `/auth/v1/settings` annonce Google désactivé, e-mail actif avec confirmation et téléphone désactivé. Le parcours e-mail de Momento demeure désactivé (`AUTH_EMAIL_ENABLED=false`) ; SMTP, redirections et essais réels ne sont pas configurés. Il faut les retours exacts `https://momento-7se.pages.dev/api/auth/callback` et `https://momento-7se.pages.dev/api/auth/recovery/callback`. Voir [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md). Aucun envoi réel effectué.
3. **Porter et tester les API métier** : le Worker actuel utilise encore les requêtes SQLite D1 et les objets R2 ; ces bindings ne sont pas configurés dans Pages. Le schéma Postgres n’est pas un remplacement automatique de `env.DB`/`env.BUCKET`. Porter aussi les compteurs Auth et les autorisations de récupération à usage unique. Le préfixe d’identité `supabase:<uuid>` doit être converti explicitement vers les UUID Postgres ; aucune fusion par e-mail.
4. **Prochaines migrations** : modifier l’état désiré dans `supabase/schemas/`, puis générer et relire une migration avec les commandes disponibles de la CLI. Vérifier l’historique distant avant application ; ne jamais rejouer la migration initiale sur cette base déjà installée. Contrôler séparément droits de colonnes/schémas et données de référence, non entièrement couverts par le diff déclaratif.
5. **Validation après raccordement** : essais Data API avec deux vrais comptes de test, Storage privé et refus après blocage, Realtime si utilisé, concurrence et charge des salons. Réserver le script SQL synthétique à une base de développement vide du bon projet ; ne pas l’exécuter dans une base contenant des membres. Les tests locaux et SQL ne valident pas OAuth, SMTP, médias, appels vidéo ni paiements.

Le futur serveur doit créer les matchs uniquement après choix réciproques, vérifier les autorisations à chaque message/jeton vidéo et révoquer la vidéo après blocage/suspension. Les ajouts/retraits de crédits doivent prendre le même verrou de profil que les admissions et être idempotents après vérification Stripe côté serveur. Les médias restent privés ; tout accès d’un interlocuteur exige une autorisation serveur et les images doivent conserver le nettoyage des métadonnées. Les rôles d’administration ne proviennent jamais de `user_metadata`. Configurer une durée de JWT et une révocation de session adaptées avant ouverture publique.
