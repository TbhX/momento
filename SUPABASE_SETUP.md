# Base Supabase Momento

Le projet dédié [**Momento**](https://supabase.com/dashboard/project/yhtngbkjqffkhfjadjzp) est créé dans l’organisation Momento (`ihyvwxutvbldkgsomhcp`), en offre **Free**, région **Paris `eu-west-3`**. Référence du projet : **`yhtngbkjqffkhfjadjzp`**. Son état `ACTIVE_HEALTHY` et PostgreSQL 17.11 ont été vérifiés le 20 octobre 2026. Le devis de création était de 0 ; aucun passage à une offre payante n’a été effectué.

Le remplacement de l’autorisation du plugin a débloqué l’accès à cette organisation. Les schémas et migrations sont installés et testés localement et à distance. Les comptes, profils, consentements, compteurs Auth et médias privés sont désormais portés vers ce projet. Volteo n’a pas été modifié. Ne pas créer un doublon ni transmettre de secret dans le chat.

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

## Installation initiale du 20 octobre 2026 — historique

- La base et l’historique étaient vides avant installation. La migration `initial_momento_schema`, version **`20261020075203`** attribuée par Supabase, est appliquée. Son SQL exact est archivé dans `supabase/migrations/20261020075203_initial_momento_schema.sql` ; empreinte SHA-256 `e2ade3824a104fd2f1179f3ae7ed89034c9b4ea5e255942573a1088fe13eff2b`.
- La première migration reprend les deux fichiers déclaratifs relus et testés, appliqués par le connecteur natif sur ce projet vide. La CLI et Docker n’étaient pas disponibles ; aucun diff CLI n’est revendiqué. Les données de référence de `seed.sql` ont été appliquées séparément : sept thèmes, environnement test et admissions désactivées.
- `supabase/tests/access.sql` a réussi sur PostgreSQL distant avec identités synthétiques et changements de rôle. Après `rollback`, zéro utilisateur Auth, profil ou salon ; 27 tables sur 27 avec RLS, sept thèmes et admissions toujours désactivées. Ce test ne constitue pas un parcours Auth avec de vrais comptes.
- La Data API refuse une lecture anonyme de `profiles` : HTTP **401**, code Postgres **42501**, aucune donnée retournée. Aucun compte réel ni message e-mail n’a été créé par ces vérifications.
- Les advisors base sécurité/performance n’ont renvoyé ni `WARN` ni `ERROR`. Les cinq remarques [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) sont de niveau `INFO` et concernent les tables `private` volontairement fermées aux membres, réservées aux opérations serveur. Les 26 [index encore inutilisés](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) sont aussi informatifs sur cette base neuve ; ne pas retirer les index de sécurité/relations en l’absence de trafic représentatif.

## Portage des comptes du 20 octobre

Deux migrations complètent la base initiale :

- `20261020113549_accounts_storage_and_session_guards` : profil et consentement, statut gratuit/Premium, contrôle des sessions, compteurs et autorisations de récupération côté serveur. Les politiques restrictives bloquent un JWT dont la session a été révoquée, y compris via la Data API directe.
- `20261020121744_serve_private_media_through_authenticated_app` : aucun téléchargement/téléversement Storage direct pour les membres. Les images passent par le Worker après vérification de session et autorisation propriétaire/interlocuteur. Les réponses sont sans cache. Un essai réel a montré que l’accès direct ne garantissait pas le comportement de révocation attendu ; ce chemin est donc fermé.

Le bucket `momento-media` est privé, limité à un Mio et aux JPEG. Le serveur retire les métadonnées avant upload, stocke les références sous l’UUID vérifié et refuse les chemins étrangers. Le compte est fermé avant sa suppression ; les images sont retirées avant l’identité Auth, et une étape interrompue peut être reprise. Les imports interrompus et les délais de sauvegarde doivent aussi disposer d’un suivi de purge avant ouverture publique.

Les RPC `server_*` sont SECURITY INVOKER et réservées à `service_role`. Les fonctions privilégiées d’utilisateur restent dans `private`, dérivent l’acteur d’`auth.uid()` et vérifient la session. Aucun rôle ne provient de métadonnées modifiables par le membre. Les fonctions publiques de membre sont des wrappers SECURITY INVOKER. La clé serveur n’est jamais utilisée comme client à cookies.

Validation finale : **139 tests locaux réussis**, build Pages réussi, deux scripts SQL distants réussis avec rollback. Le Worker compilé a réussi les sept contrôles contre les vraies API Auth/Postgres/Storage avec deux identités jetables confirmées administrativement, sans e-mail ni SMS : persistance, isolation, médias privés, export, révocation et suppression. Une lecture SQL indépendante confirme zéro compte Auth, profil et objet média après nettoyage, 27 tables avec RLS et les admissions fermées. Les advisors courants renvoient cinq informations RLS privées, onze informations d’index inutilisés et un avertissement Auth sur les mots de passe compromis ; ce dernier est détaillé ci-dessous. Aucun essai Google, SMTP, vidéo ou appareil réel n’est revendiqué.

## Configuration et travaux restants

1. **Pages** : `SUPABASE_DATA_ENABLED=true`, URL, clés modernes publiable/serveur et secret de cookies. Les secrets sont chiffrés ; aucune valeur réelle dans le dépôt. Préserver les secrets masqués lors des mises à jour. Les comptes ne nécessitent plus D1/R2 ; les autres anciens services sont fermés tant qu’ils ne sont pas portés.
2. **Retours Auth enregistrés** : Site URL `https://momento-7se.pages.dev` et exactement `/api/auth/callback`, `/api/auth/recovery/callback` sous cette origine, sans wildcard.
3. **Google** : client ID/secret encore absents ; console Google inaccessible dans le navigateur de cette session. Le retour à enregistrer côté Google est `https://yhtngbkjqffkhfjadjzp.supabase.co/auth/v1/callback`. Le bouton dépend de l’activation réelle du fournisseur.
4. **E-mail** : le propriétaire choisit désormais e-mail/mot de passe simples pour commencer. Le mode `basic` sans SMTP est préparé ; l’activation attend sa confirmation explicite avant désactivation de la vérification d’adresse. La confirmation reste active côté Supabase, sans SMTP de production. Le propriétaire ne dispose pas encore de domaine d’expéditeur. `AUTH_EMAIL_ENABLED=false` ; modèles prêts, sans message réel envoyé. SMS désactivé. Voir [PRODUCTION_AUTH.md](PRODUCTION_AUTH.md).
5. **Avis Auth restant** : l’advisor signale la protection contre les mots de passe compromis désactivée. Cette fonction Supabase exige Pro ou plus, selon [la documentation actuelle](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun abonnement payant n’est activé. Avant d’ouvrir le mot de passe au public, aligner les règles natives du fournisseur sur le formulaire et définir une protection adaptée au budget.
6. **Suite métier** : portage des salons, relations, paiements et médias d’interlocuteurs de bout en bout ; pas de fusion par e-mail. Les contrôles vidéo, modération, conservation et restauration restent requis avant ouverture publique.
7. **Migrations suivantes** : modifier l’état désiré dans `supabase/schemas/`, générer et relire une migration avec les commandes CLI disponibles, vérifier l’historique et les droits explicites. Les migrations de cette session ont été appliquées par le connecteur natif après tests du delta et de son rejeu, puis archivées sous la version réelle retournée par Supabase ; aucun diff CLI n’est revendiqué.

Les tests SQL synthétiques restent réservés à une base de développement vide. Le vérificateur API explicite utilise deux identités jetables confirmées administrativement et nettoyées ; il n’envoie ni e-mail ni SMS. Les résultats finaux sont consignés dans [ROADMAP_PRODUCTION.md](ROADMAP_PRODUCTION.md).

Le futur serveur doit créer les matchs uniquement après choix réciproques, vérifier les autorisations à chaque message/jeton vidéo et révoquer la vidéo après blocage/suspension. Les ajouts/retraits de crédits doivent prendre le même verrou de profil que les admissions et être idempotents après vérification Stripe côté serveur. Les médias restent privés ; tout accès d’un interlocuteur exige une autorisation serveur et les images doivent conserver le nettoyage des métadonnées. Les rôles d’administration ne proviennent jamais de `user_metadata`. Configurer une durée de JWT et une révocation de session adaptées avant ouverture publique.


## Communauté persistante et activation simple

La migration `20261020140539_persistent_community` est appliquée et archivée ; SHA-256 `d912f6b11e2eec8d70f298b93d3c0b13468c3cfb4de087d319ac69bc97c94d93`. Elle ajoute les RPC de catalogue et de relations, avec session active, acteur dérivé, consentement du destinataire, limites, blocages réciproques et verrous ordonnés. Les écritures de blocage passent uniquement par l’opération atomique. Les wrappers publics sont SECURITY INVOKER, les implémentations privées SECURITY DEFINER avec search_path vide. Aucun nouveau rôle, avantage payant ou média public.

Supabase est réglé pour l’inscription simple sans e-mail (`mailer_autoconfirm=true`) et refuse nativement les mots de passe de moins de 12 caractères. Google et téléphone restent inactifs. La variable Pages `AUTH_EMAIL_ENABLED` reste false : son activation a été refusée par le contrôle automatique, qui exige un accord explicite pour l’ouverture sans domaine d’expéditeur, confirmation ou récupération. Le mode basic n’exige pas SMTP techniquement ; cette ouverture reste bloquée administrativement. Ne pas contourner le refus.

153 tests locaux et build Pages réussis. `supabase/tests/community.sql` vérifie accès tiers/anonyme/révoqué, demandes hors contexte, consentement, unicité, invitation sans débit et blocage. Le vérificateur réel accepte `--basic-signup --community --community-only` pour concentrer l’essai sur inscription, profil, liens et suppression, sans e-mail/SMS. Le mode complet conserve les essais des images/export/révocation. Les identités, salons et signalements synthétiques doivent tous être nettoyés ; conserver les identifiants privés jusqu’au contrôle final. Ne pas lancer les tests SQL distants sur une base contenant de vrais membres.

Les trois scripts SQL distants (accès, comptes, communauté) ont réussi avec rollback après nettoyage. La vérification API concentrée a réussi quatre contrôles contre les vrais services avec deux inscriptions immédiates, sans e-mail/SMS. Le contrôle SQL indépendant confirme zéro fixture Auth/profil/salon/relation/invitation/signalement/média, 27 tables RLS et admissions fermées. Les délais du premier essai complet ne sont pas présentés comme un nouveau succès des tests média/export/révocation : ces fonctions conservent leurs preuves de la livraison précédente.
