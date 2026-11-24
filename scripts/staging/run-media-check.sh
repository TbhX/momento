#!/usr/bin/env bash
# Linux x86_64, Python 3.12. No project credentials or hosted fixtures.
set -euo pipefail
dir=$(mktemp -d)
trap 'rm -rf -- "$dir"' EXIT
cd "$dir"
curl --fail --silent --show-error --location --retry 2 --max-time 90 \
  https://github.com/livekit/livekit/releases/download/v1.13.11/livekit_1.13.11_linux_amd64.tar.gz -o server.tgz
echo '1e9ee90ca301e1842b2887fc77cb122759756a9c8aeb4334ee91de3325ec43fb  server.tgz' | sha256sum --check --status
tar -xzf server.tgz livekit-server
python3.12 -m venv env
env/bin/pip -q install livekit==1.3.0 livekit-api==2.0.1 livekit-protocol==2.0.1
cd - >/dev/null
"$dir/env/bin/python" scripts/staging/media-permissions.py "$dir/livekit-server"
