# Comptes utilisateurs Momento

Supabase Auth assure les comptes e-mail/mot de passe et les sessions ; les profils et médias privés sont associés à l’utilisateur. Aucun compte ChatGPT ou Cloudflare n’est requis pour les membres.

Le site suit l’activation du fournisseur e-mail et l’autorisation native de créer des comptes dans Supabase. Le double interrupteur historique de l’hébergement a été retiré pour cette cible. Une fermeture des nouvelles inscriptions n’interrompt pas la connexion des membres existants.

Le démarrage choisi utilise une inscription immédiate sans vérification d’adresse. La récupération par e-mail n’est pas encore disponible et le formulaire le précise. Google et SMS restent reportés. Passer ultérieurement à la confirmation et à la récupération exigera la configuration et les essais d’un expéditeur réel.

Les protections de session, les limites de tentative et les contrôles d’accès sont conservés. Des réglages manquants, incohérents ou indisponibles ne permettent aucune création. Le formulaire et l’accueil distinguent l’inscription ouverte, les inscriptions fermées avec connexion disponible et le service indisponible.

L’accès administrateur est attribué dans les données privées du serveur. Un code privé, expirant et utilisable une seule fois, permet au propriétaire de choisir son mot de passe sur le site. Un compte en attente d’activation n’a aucun accès organisateur. Les paramètres de rôle ou de formule envoyés par le navigateur ne donnent aucun droit. L’administration ne confère pas Premium.

Validation locale : 318 tests et build Pages réussis pour la livraison des salons personnalisables. Les scénarios couvrent notamment les rôles, sessions révoquées, accès entre comptes et limites d’inscription. L’état d’activation de l’organisateur est relu côté serveur ; il ne doit pas être recréé ou réinitialisé lors d’une mise à jour. Les essais sur téléphone physique et les appels réels à deux appareils restent à valider.

Les identifiants de projet, paramètres de sécurité détaillés et informations d’exploitation sont conservés dans le suivi privé.
