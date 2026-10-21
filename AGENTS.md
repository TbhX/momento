# Momento — contribution

Travailler dans le dépôt GitHub de référence de Momento, sur la branche principale, en préservant les changements du propriétaire. Pour du code, exécuter `pnpm test` puis `pnpm run build:pages` avant publication. Pour des documents seuls, relire le diff. Aucun force-push ; proposer une PR si nécessaire.

Supabase Auth gère les comptes. Le site suit le fournisseur e-mail natif et l’autorisation de créer de nouveaux comptes ; une fermeture des inscriptions doit laisser fonctionner la connexion existante. Les variables historiques de l’adaptateur D1 ne doivent pas fermer la cible Supabase. Conserver les tests de cohérence du mode de confirmation, des quotas, des sessions et des accès entre comptes. Le profil doit être complété avant les espaces membre.

Ne publier aucune clé, donnée personnelle ou détail d’infrastructure privé. Conserver les paramètres sensibles dans les services concernés. Ne modifier aucun autre projet. Les paramètres opérationnels sont conservés dans le suivi privé du projet.

Les mises à jour de routine sont autorisées après vérification. Vérifier aussi le résultat réellement servi par le site ; un push seul ne prouve pas un déploiement réussi. Décrire séparément les tests locaux, les vérifications des services et les essais sur appareils. La démonstration doit rester explicitement distincte des rencontres réelles.

Ne pas activer de service payant, de vente ou de rencontre réelle sans les validations correspondantes. La partie physique reste un teaser. Une PWA installable n’est pas une publication App Store ou Google Play. Voir les documents publics de suivi pour les limites fonctionnelles courantes.
