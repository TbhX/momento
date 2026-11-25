# Essai local des permissions média

Ce scénario démarre son propre LiveKit sur la boucle locale, avec deux identités et une clé éphémères. Il ne contacte ni le site Momento ni Supabase. Utiliser Linux avec une interface de boucle locale disponible et les ports 17880–17882 libres. Le serveur doit pouvoir lire les interfaces réseau via netlink.

Depuis la racine du dépôt, avec Python 3.12 et le binaire officiel livekit-server 1.13.11 préinstallé :

```sh
python3.12 -m venv /tmp/momento-media-env
/tmp/momento-media-env/bin/pip install livekit==1.3.0 livekit-api==2.0.1 livekit-protocol==2.0.1
/tmp/momento-media-env/bin/python scripts/staging/media-permissions.py /chemin/vers/livekit-server
```

Le pair doit être abonné au micro synthétique. Une publication caméra sous permission micro seul doit être refusée. Après autorisation explicite par le serveur, le pair doit voir la publication caméra. Une mise à jour serveur retirant cette permission doit ensuite faire disparaître la publication distante, empêcher sa republication et préserver le micro. Un délai dépassé, une erreur de transport ou une caméra simplement masquée dans l’interface ne valident pas le scénario.

Après autorisation, le pair doit décoder une image rouge synthétique de 16 × 16 pixels. Le scénario journalise aussi une borne supérieure du délai entre la demande de retrait et le constat que la publication a disparu chez le pair. Il ne mesure pas la dernière image affichée sur un téléphone. La transition de permission est déclenchée par le test ; le raccordement aux droits Momento, les jetons renouvelés par le fournisseur et la coupure sur appareils restent à valider séparément.

Sur Linux x86_64, `bash scripts/staging/run-media-check.sh` prépare aussi le serveur (archive vérifiée par SHA-256) et l’environnement Python temporaires. Le workflow « Permissions média du binôme » exécute cette commande sur un runner Linux standard lorsque le scénario change sur main. Il est limité aux dépôts publics, sans secret de déploiement. Un workflow présent dans Git ne constitue pas une preuve de réussite : consulter le résultat du job pour le commit testé.
