# Comptes utilisateurs Momento

Supabase Auth assure les comptes e-mail/mot de passe et les sessions ; les profils et médias privés sont associés à l’utilisateur. Aucun compte ChatGPT ou Cloudflare n’est requis pour les membres.

Le site suit l’activation du fournisseur e-mail et l’autorisation native de créer des comptes dans Supabase. Le double interrupteur historique de l’hébergement a été retiré pour cette cible. Une fermeture des nouvelles inscriptions n’interrompt pas la connexion des membres existants.

Le démarrage choisi utilise une inscription immédiate sans vérification d’adresse. La récupération par e-mail n’est pas encore disponible et le formulaire le précise. Google et SMS restent reportés. Passer ultérieurement à la confirmation et à la récupération exigera la configuration et les essais d’un expéditeur réel.

Les protections de session, les limites de tentative et les contrôles d’accès sont conservés. Des réglages manquants, incohérents ou indisponibles ne permettent aucune création. Le formulaire et l’accueil distinguent l’inscription ouverte, les inscriptions fermées avec connexion disponible et le service indisponible.

L’accès administrateur est attribué dans les données privées du serveur. Un code privé, expirant et utilisable une seule fois, permet au propriétaire de choisir son mot de passe sur le site. Un compte en attente d’activation n’a aucun accès organisateur. Les paramètres de rôle ou de formule envoyés par le navigateur ne donnent aucun droit. L’administration ne confère pas Premium.

Validation de cette livraison : 168 tests locaux et build Pages réussis. Les tests couvrent les rôles, sessions révoquées, codes expirés et réutilisés, requêtes concurrentes d’activation, actions de modération et accès entre comptes. Le précédent compte synthétique a été supprimé après autorisation. L’identité organisateur a été créée via Auth, sans envoi d’e-mail, et sa session provisoire est révoquée. Le propriétaire doit encore réaliser son activation et les appareils physiques restent à tester.

Les identifiants de projet, paramètres de sécurité détaillés et informations d’exploitation sont conservés dans le suivi privé.
