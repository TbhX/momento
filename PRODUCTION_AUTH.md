# Comptes utilisateurs Momento

Supabase Auth assure les comptes e-mail/mot de passe et les sessions ; les profils et médias privés sont associés à l’utilisateur. Aucun compte ChatGPT ou Cloudflare n’est requis pour les membres.

Le site suit l’activation du fournisseur e-mail et l’autorisation native de créer des comptes dans Supabase. Le double interrupteur historique de l’hébergement a été retiré pour cette cible. Une fermeture des nouvelles inscriptions n’interrompt pas la connexion des membres existants.

Le démarrage choisi utilise une inscription immédiate sans vérification d’adresse. La récupération par e-mail n’est pas encore disponible et le formulaire le précise. Google et SMS restent reportés. Passer ultérieurement à la confirmation et à la récupération exigera la configuration et les essais d’un expéditeur réel.

Les protections de session, les limites de tentative et les contrôles d’accès sont conservés. Des réglages manquants, incohérents ou indisponibles ne permettent aucune création. Le formulaire et l’accueil distinguent l’inscription ouverte, les inscriptions fermées avec connexion disponible et le service indisponible.

Validation de cette livraison : 161 tests locaux et build Pages réussis. Le formulaire d’inscription ouvert est visible sur le site publié. Un compte synthétique et son profil ont été créés sur les vraies API de production. L’interruption de cet essai ne permet pas de revendiquer la déconnexion/reconnexion ni le nettoyage final ; ce dernier reste à clôturer. Les essais complets de la livraison précédente constituent une preuve distincte. Les appareils physiques restent à tester.

Les identifiants de projet, paramètres de sécurité détaillés et informations d’exploitation sont conservés dans le suivi privé.
