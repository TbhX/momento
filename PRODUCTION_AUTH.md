# Comptes utilisateurs Momento

Supabase Auth assure les comptes e-mail/mot de passe et les sessions ; les profils et médias privés sont associés à l’utilisateur. Aucun compte ChatGPT ou Cloudflare n’est requis pour les membres.

Le site suit l’activation du fournisseur e-mail et l’autorisation native de créer des comptes dans Supabase. Le double interrupteur historique de l’hébergement a été retiré pour cette cible. Une fermeture des nouvelles inscriptions n’interrompt pas la connexion des membres existants.

Le démarrage choisi utilise une inscription immédiate sans vérification d’adresse. La récupération par e-mail n’est pas encore disponible et le formulaire le précise. Google et SMS restent reportés. Passer ultérieurement à la confirmation et à la récupération exigera la configuration et les essais d’un expéditeur réel.

Les protections de session, les limites de tentative et les contrôles d’accès sont conservés. Des réglages manquants, incohérents ou indisponibles ne permettent aucune création. Le formulaire et l’accueil distinguent l’inscription ouverte, les inscriptions fermées avec connexion disponible et le service indisponible.

L’accès administrateur est attribué dans les données privées du serveur. Un code privé, expirant et utilisable une seule fois, permet au propriétaire de choisir son mot de passe sur le site. Un compte en attente d’activation n’a aucun accès organisateur. Les paramètres de rôle ou de formule envoyés par le navigateur ne donnent aucun droit. L’administration ne confère pas Premium.

Validation locale : 318 tests et build Pages réussis pour la livraison des salons personnalisables. Les scénarios couvrent notamment les rôles, sessions révoquées, accès entre comptes et limites d’inscription. L’état d’activation de l’organisateur est relu côté serveur ; il ne doit pas être recréé ou réinitialisé lors d’une mise à jour. Les essais sur téléphone physique et les appels réels à deux appareils restent à valider.

Les identifiants de projet, paramètres de sécurité détaillés et informations d’exploitation sont conservés dans le suivi privé.

La double authentification par application TOTP se configure depuis Mon profil → Sécurité et double authentification. L’ajout demande le mot de passe actuel, puis un code valide de l’application. Les autres sessions AAL1 sont refusées pour un compte protégé ; les contrôles du Worker et les politiques RLS couvrent aussi un accès direct à la Data API. La déconnexion de tous les appareils utilise la révocation native globale.

Le second facteur est obligatoire pour les opérations administrateur/modérateur, le laboratoire illimité et la publication des salons de test. Le propriétaire doit effectuer lui-même l’association sur son appareil ; aucun code ne lui est demandé en discussion. Le rôle et le mot de passe existants restent inchangés. Conserver la clé dans un gestionnaire ou prévoir un secours avant activation : aucune récupération automatique d’un facteur perdu n’est encore disponible.
