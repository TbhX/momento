# Présence préparée avant un tête-à-tête

Ce socle distingue une présence dans le salon d’un accord pour préparer un binôme déjà attribué. Il ne crée ni rencontre, ni admission, ni paiement, ni jeton média. L’interface de répétition locale n’appelle pas ces routes. La route reste fermée côté hébergement ; le schéma de préparation est appliqué à la base distante depuis le 17 novembre 2026. Ouvrir les drapeaux ne suffit pas à rendre des appels réels disponibles.

## Contrat réservé au membre

- `GET /api/service/encounters/<id>/readiness` : état de sa propre rencontre.
- `POST` sur le même chemin : `{action:"prepare", mode:"audio"|"video"}`, `{action:"heartbeat"}` ou `{action:"leave"}`.

Identité, session, entrée, environnement, rôle et droits viennent du serveur et d’Auth. Les champs supplémentaires sont refusés. Les mutations exigent la même origine et le marqueur de requête applicatif. Les données privées restent sans cache. Les lectures et écritures de préparation utilisent le budget communauté commun ; aucun polling n’est ajouté à l’interface par cette livraison.

La préparation est possible au plus tôt trente secondes avant le tour déjà attribué. Elle exige l’entrée et la présence natives actives ; une entrée audio n’autorise pas une préparation vidéo. Les deux modes doivent être identiques : un désaccord attend un nouveau choix explicite, sans repli automatique. La préparation signifie un choix applicatif, pas une preuve de permission du navigateur ou de flux média connecté.

Les baux de préparation expirent au bout de 45 secondes, comme dans le noyau de rotation. Ils ne prolongent pas le bail d’entrée du salon. Après expiration, un heartbeat ne recrée pas l’accord : une préparation explicite est requise. Une nouvelle session ne reprend pas une préparation de l’ancienne. L’état prend aussi en compte le second facteur natif éventuellement activé entre-temps, le Premium d’une admission Premium, la confirmation de réservation hébergée et le genre déclaré cohérent avec celle-ci.

La réponse distingue notamment `disabled`, `scheduled`, `waiting`, `ready`, `closed`, `unavailable` et `ended`. Elle fournit, lorsque pertinent, sa préparation, l’accord des deux, le mode commun et les échéances natives. Elle ne retourne ni identifiant de session, entrée, participant tiers, clé de requête, solde ou jeton. `mediaEnabled` reste toujours faux. `bothReady` peut être vrai avant le départ, mais `ready` exige aussi le statut natif live et l’heure prévue. Les horaires d’origine ne sont jamais repoussés.

## Révocation et transactions

Les verrous suivent les contrôles de consentement existants : profils ordonnés, réglages de préparation puis réglages natifs, salon, rencontre, présences ordonnées et préparations ordonnées. La préparation s’effectue par membre/rencontre, sans acteur fourni par le navigateur. Aucun appel au fournisseur vidéo n’a lieu dans la transaction.

Départ du salon, blocage (y compris envers l’hôte), suspension du participant ou de l’hôte, fermeture du salon/de la rencontre, des admissions/de la préparation et changement d’environnement marquent les accords concernés comme retirés. Un déblocage, rétablissement ou changement de réglages ultérieur ne les réactive pas. Les sessions, présences, réservations et apartés actifs sont également relus lors de l’évaluation. Le retrait explicite reste disponible après fermeture et annule sa rencontre ; le mécanisme existant ferme alors ses prolongations. Les crédits consommés ne sont pas remboursés par cette action. Les salons publiés pour test administrateur restent systématiquement exclus.

Les deux tables privées ont RLS et aucun accès direct membre/anon. Les implémentations privées utilisent une identité Auth et un chemin de recherche vide ; les wrappers publics restent SECURITY INVOKER. Le vérificateur interne de session d’un autre participant n’est pas exécutable par un membre. La fonction d’export préparée ne retourne que son propre mode et ses dates de préparation, présence et retrait, sans session ni pair. L’export de compte appelle ce RPC avec le client membre. Une erreur ou un dépassement de taille fait échouer l’export entier, sans fichier partiel ni diagnostic privé.

## Preuves et limites

Les scénarios sont rejoués sur le schéma déclaratif et l’historique, en bases locales isolées ; le delta généré depuis le déclaratif est rejoué deux fois. Les tests couvrent les deux sessions, rôles tiers, modes, temps, départ, révocation, MFA, Premium, blocage, suspension, fermetures, environnement, nouvelle rencontre et export. Les tests de routes vérifient les drapeaux, l’origine, les champs autorisés et l’absence de droit média. Aucune fixture hébergée ou identité du propriétaire n’est créée/modifiée.

La concurrence sur des connexions Postgres indépendantes, le retrait d’un flux déjà ouvert, les véritables permissions caméra/micro et deux appareils restent à tester sur développement/staging. Ce reçu ne doit jamais servir seul à émettre un token ou à faire confiance au `ready` du navigateur. Il reste à ajouter l’ordonnanceur persistant et l’intégration média par binôme, avec revalidation et révocation effective, avant d’ouvrir les rencontres.

## Historique des tentatives antérieures

Le connecteur a retourné deux fois `Invalid or expired requestState`. Après chaque tentative, les lectures de l’historique et du catalogue confirment qu’aucune migration de préparation, table ou RPC nouveau n’existe à distance. Le delta était alors conservé en attente, sans version distante attribuée. Ce blocage est résolu par l’application du 17 novembre décrite ci-dessous. Ne pas appliquer de SQL synthétique au projet hébergé pour tester.

### Contrôle du 4 novembre 2026

Le connecteur a de nouveau laissé expirer deux confirmations d’application. Le catalogue et l’historique relus confirment l’absence de migration et de fonctions de préparation. Le delta reste en attente ; aucune modification de données ou d’activation n’a été effectuée. Ne pas contourner cette confirmation par une écriture SQL directe.

Le Worker projette désormais une liste fermée de champs et vérifie les états, booléens, modes, baux et dates cohérentes. Une réponse native malformée échoue avec une erreur de service générique ; les champs privés ou futurs ne sont jamais recopiés. Les dates deviennent des ISO UTC, les réponses sont sans cache et `mediaEnabled` reste faux. L’export conservait alors ses dépendances précédentes jusqu’à l’application effective du schéma.


## Application du 17 novembre 2026

Après relecture de l’identité, de l’historique et de l’absence du schéma, le delta existant a été revu et rejoué deux fois sur les deux sources locales. L’application native a réussi ; la version réellement attribuée est archivée dans `supabase/migrations/20261117013817_call_readiness.sql`. L’historique contient désormais quinze migrations : ne pas les rejouer.

Contrôles SQL distants : préparation, admissions, publication et prolongations désactivées ; zéro préparation et zéro crédit ; toutes les tables public/private avec RLS. Les trois wrappers publics sont INVOKER, réservés aux membres, et le vérificateur interne de session refuse aussi les membres. Aucun accès direct anon/membre aux préparations. Advisors : quinze tables privées deny-all signalées en INFO (les deux nouvelles incluses), avertissement existant de protection des mots de passe compromis inchangé ; aucune mise à niveau.

Aucun compte, rencontre ou présence de test hébergé créé. L’export est raccordé au RPC membre, mais aucun export réel du propriétaire ni appel authentifié de préparation n’est testé. Ordonnanceur, concurrence indépendante et médias à deux appareils restent à valider avant ouverture.
