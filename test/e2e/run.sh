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

# Local secrets (OPENAI_API_KEY etc). Values already in the environment win, so CI
# secrets are never overridden by a stale local file.
if [[ -f "$HERE/.env" ]]; then
  while IFS='=' read -r key value; do
    key="${key%%[[:space:]]*}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    if [[ -z "${!key:-}" ]]; then export "$key=$value"; fi
  done < "$HERE/.env"
fi

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
echo "    published"

# Also publish the previous release, so the suite can install that first and then
# exercise n8n's real upgrade path rather than only a clean install.
PKG_NAME="$(node -p "require('./package.json').name")"
PKG_VERSION="$(node -p "require('./package.json').version")"
echo "==> resolving the previous published release of $PKG_NAME"
PREV_VERSION="$(npm view "$PKG_NAME" versions --json --registry https://registry.npmjs.org 2>/dev/null \
  | node -e "
    let raw='';
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => {
      try {
        const versions = JSON.parse(raw);
        const target = process.argv[1];
        const cmp = (a, b) => {
          const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
          for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
          return 0;
        };
        // Highest published release strictly older than the build under test.
        const older = versions.filter((v) => /^[0-9]+\.[0-9]+\.[0-9]+$/.test(v) && cmp(v, target) < 0).sort(cmp);
        process.stdout.write(older.length ? older[older.length - 1] : '');
      } catch { process.stdout.write(''); }
    });
  " "$PKG_VERSION" || true)"

if [[ -n "$PREV_VERSION" ]]; then
  echo "    previous release: $PREV_VERSION"
  PREV_TARBALL="$(npm pack "$PKG_NAME@$PREV_VERSION" --registry https://registry.npmjs.org --silent 2>/dev/null | tail -1 || true)"
  if [[ -n "$PREV_TARBALL" && -f "$PREV_TARBALL" ]]; then
    # --tag is required: npm refuses to move "latest" backwards to an older version,
    # and "latest" must keep pointing at the build under test.
    NPM_CONFIG_USERCONFIG="$NPMRC" npm publish "$PREV_TARBALL" \
      --registry "http://127.0.0.1:${VERDACCIO_PORT}" --tag previous >/dev/null 2>&1 \
      && echo "    published $PREV_VERSION for the upgrade test" \
      || echo "    WARNING: could not publish $PREV_VERSION; the upgrade test will be skipped"
    rm -f "$PREV_TARBALL"
    export E2E_PREVIOUS_VERSION="$PREV_VERSION"
  else
    echo "    WARNING: could not fetch $PREV_VERSION from npmjs; the upgrade test will be skipped"
  fi
else
  echo "    no older release found; the upgrade test will be skipped"
fi
rm -f "$NPMRC"

echo "==> running E2E"
E2E_N8N_URL="http://127.0.0.1:${N8N_PORT}" node "$HERE/run-e2e.mjs"
