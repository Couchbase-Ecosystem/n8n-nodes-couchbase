#!/usr/bin/env bash
# Full E2E: build the package, publish it to a throwaway registry, let n8n install
# it as a community node, then run workflows against a real Couchbase cluster.
#
#   test/e2e/run.sh            # bring the stack up, test, tear down
#   E2E_KEEP=1 test/e2e/run.sh # leave the stack running for debugging
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
COMPOSE=(docker compose -f "$HERE/docker-compose.yml")

VERDACCIO_PORT="${VERDACCIO_PORT:-4873}"
N8N_PORT="${N8N_PORT:-5678}"
export VERDACCIO_PORT N8N_PORT

cleanup() {
  local code=$?
  if [[ "${E2E_KEEP:-0}" != "1" ]]; then
    echo "==> tearing down"
    "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  else
    echo "==> E2E_KEEP=1, leaving the stack up (n8n: http://127.0.0.1:${N8N_PORT})"
  fi
  exit $code
}
trap cleanup EXIT

echo "==> building the package"
cd "$ROOT"
pnpm build

echo "==> packing"
rm -f "$ROOT"/n8n-nodes-couchbase-*.tgz
TARBALL="$(npm pack --ignore-scripts --silent | tail -1)"
echo "    $TARBALL"

echo "==> starting the stack (couchbase, verdaccio, n8n)"
"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --wait

echo "==> provisioning couchbase"
"${COMPOSE[@]}" exec -T couchbase bash -s < "$HERE/scripts/provision-couchbase.sh"

echo "==> publishing $TARBALL to the local registry"
NPMRC="$(mktemp)"
echo "//127.0.0.1:${VERDACCIO_PORT}/:_authToken=e2e-anonymous" > "$NPMRC"
NPM_CONFIG_USERCONFIG="$NPMRC" npm publish "$TARBALL" \
  --registry "http://127.0.0.1:${VERDACCIO_PORT}" >/dev/null
rm -f "$NPMRC"
echo "    published"

echo "==> running E2E"
E2E_N8N_URL="http://127.0.0.1:${N8N_PORT}" node "$HERE/run-e2e.mjs"
