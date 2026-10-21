# Comptes utilisateurs Momento

Supabase Auth assure les comptes e-mail/mot de passe et les sessions ; les profils et médias privés sont associés à l’utilisateur. Aucun compte ChatGPT ou Cloudflare n’est requis pour les membres.

Le site suit l’activation du fournisseur e-mail et l’autorisation native de créer des comptes dans Supabase. Le double interrupteur historique de l’hébergement a été retiré pour cette cible. Une fermeture des nouvelles inscriptions n’interrompt pas la connexion des membres existants.

Le démarrage choisi utilise une inscription immédiate sans vérification d’adresse. La récupération par e-mail n’est pas encore disponible et le formulaire le précise. Google et SMS restent reportés. Passer ultérieurement à la confirmation et à la récupération exigera la configuration et les essais d’un expéditeur réel.

Les protections de session, les limites de tentative et les contrôles d’accès sont conservés. Des réglages manquants, incohérents ou indisponibles ne permettent aucune création. Le formulaire et l’accueil distinguent l’inscription ouverte, les inscriptions fermées avec connexion disponible et le service indisponible.

Validation de cette livraison : 161 tests locaux et build Pages réussis. Une lecture du vrai service Auth confirme l’inscription simple autorisée ; elle ne valide pas à elle seule un nouveau compte sur le site publié. Les essais de création/profil/suppression réalisés lors de la livraison précédente restent une preuve distincte. Le déploiement et les appareils doivent être contrôlés séparément.

Les identifiants de projet, paramètres de sécurité détaillés et informations d’exploitation sont conservés dans le suivi privé.
