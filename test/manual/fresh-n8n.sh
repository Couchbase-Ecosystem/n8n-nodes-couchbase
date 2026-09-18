#!/usr/bin/env bash
#
# Run a clean n8n in Docker with the *local* build of this package installed,
# for hands-on manual testing.
#
#   ./test/manual/fresh-n8n.sh up       build, pack, install, start
#   ./test/manual/fresh-n8n.sh reload   rebuild + reinstall + restart (after a code change)
#   ./test/manual/fresh-n8n.sh logs     follow the container logs
#   ./test/manual/fresh-n8n.sh shell    shell into the container
#   ./test/manual/fresh-n8n.sh down     stop and remove the container (keeps your workflows)
#   ./test/manual/fresh-n8n.sh reset    down + delete the volume (wipes everything)
#
# Overrides:
#   N8N_IMAGE_TAG=2.9.2  ./test/manual/fresh-n8n.sh up   (defaults to the E2E pinned version)
#   N8N_PORT=6000        ./test/manual/fresh-n8n.sh up
#
# Why pack instead of mounting the worktree? `npm install <dir>` symlinks, which
# would make the container resolve deps from the host's node_modules — where the
# `couchbase` native binding is a macOS arm64 binary. Packing forces npm to
# install Linux binaries inside the container.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Default to the same n8n version the E2E suite pins, so manual testing matches CI.
DEFAULT_TAG="$(sed -n 's|.*n8nio/n8n:${N8N_IMAGE_TAG:-\([^}]*\)}.*|\1|p' "$ROOT/test/e2e/docker-compose.yml" 2>/dev/null | head -1)"
IMAGE_TAG="${N8N_IMAGE_TAG:-${DEFAULT_TAG:-2.39.5}}"
IMAGE="docker.n8n.io/n8nio/n8n:${IMAGE_TAG}"
PORT="${N8N_PORT:-5679}"
VOLUME="${N8N_VOLUME:-n8n-manual}"
CONTAINER="${N8N_CONTAINER:-n8n-manual}"
PKG_NAME="$(node -p "require('$ROOT/package.json').name")"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }

pack() {
	if [ ! -d "$ROOT/node_modules" ]; then
		echo "$ROOT/node_modules is missing — run 'pnpm install' first" >&2
		return 1
	fi
	log "Building $PKG_NAME"
	# tsc reports errors on stdout, so discarding it hides the whole reason a
	# build failed. Capture instead, and print it only when something breaks.
	local out
	if ! out="$(cd "$ROOT" && pnpm build 2>&1)"; then
		printf '%s\n' "$out" >&2
		echo "build failed" >&2
		return 1
	fi
	log "Packing tarball"
	rm -f "$ROOT"/*.tgz
	if ! out="$(cd "$ROOT" && npm pack --ignore-scripts 2>&1)"; then
		printf '%s\n' "$out" >&2
		echo "npm pack failed" >&2
		return 1
	fi
	TARBALL="$(basename "$(ls "$ROOT"/*.tgz | head -1)")"
	log "Packed $TARBALL"
}

install_pkg() {
	log "Installing into the n8n volume ($VOLUME)"
	docker run --rm -u 0 \
		-v "$VOLUME":/data \
		-v "$ROOT":/pkg:ro \
		--entrypoint sh "$IMAGE" -c "
			set -e
			mkdir -p /data/nodes
			cd /data/nodes
			[ -f package.json ] || echo '{\"name\":\"installed-nodes\",\"private\":true}' > package.json
			rm -rf node_modules/$PKG_NAME
			npm install /pkg/$TARBALL \
				--audit=false --fund=false --bin-links=false \
				--install-strategy=shallow --ignore-scripts=true --package-lock=false
			chown -R 1000:1000 /data
		" >/dev/null
	log "Installed"
}

# n8n builds webhook/chat URLs from its own base URL, not from the page origin.
# Inside the container it listens on 5678, so without WEBHOOK_URL it hands the
# browser http://localhost:5678/... while the editor is served from $PORT — the
# chat panel then fetches a port nothing is published on and fails with a bare
# "Failed to fetch". Pin both to the host port we actually publish.
start() {
	docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
	log "Starting n8n $IMAGE_TAG on port $PORT"
	docker run -d --name "$CONTAINER" \
		-p "$PORT":5678 \
		-v "$VOLUME":/home/node/.n8n \
		--add-host host.docker.internal:host-gateway \
		-e WEBHOOK_URL="http://localhost:$PORT/" \
		-e N8N_EDITOR_BASE_URL="http://localhost:$PORT/" \
		-e N8N_DIAGNOSTICS_ENABLED=false \
		-e N8N_SECURE_COOKIE=false \
		-e N8N_RUNNERS_ENABLED=true \
		-e GENERIC_TIMEZONE=UTC \
		"$IMAGE" >/dev/null
}

wait_ready() {
	log "Waiting for n8n to come up"
	for _ in $(seq 1 90); do
		if curl -sf --max-time 2 "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
			log "Ready at http://localhost:$PORT"
			return 0
		fi
		if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
			echo "container exited:" >&2
			docker logs --tail 40 "$CONTAINER" >&2
			return 1
		fi
		sleep 2
	done
	echo "timed out waiting for n8n" >&2
	docker logs --tail 40 "$CONTAINER" >&2
	return 1
}

verify() {
	log "Node files visible to n8n:"
	docker exec "$CONTAINER" sh -c "ls /home/node/.n8n/nodes/node_modules/$PKG_NAME/dist/nodes 2>/dev/null" || true
	log "Version installed: $(docker exec "$CONTAINER" node -p "require('/home/node/.n8n/nodes/node_modules/$PKG_NAME/package.json').version" 2>/dev/null || echo '?')"
	# `--install-strategy=shallow` nests deps under the package rather than hoisting
	# them, so resolve from the package dir instead of guessing a layout.
	log "Couchbase SDK: $(docker exec "$CONTAINER" node -p "require(require.resolve('couchbase/package.json', { paths: ['/home/node/.n8n/nodes/node_modules/$PKG_NAME'] })).version" 2>/dev/null || echo 'not found')"
}

case "${1:-up}" in
	up)
		docker volume create "$VOLUME" >/dev/null
		pack
		install_pkg
		start
		wait_ready
		verify
		;;
	reload)
		pack
		install_pkg
		docker restart "$CONTAINER" >/dev/null
		wait_ready
		verify
		;;
	logs)   docker logs -f "$CONTAINER" ;;
	shell)  docker exec -it "$CONTAINER" sh ;;
	down)   docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; log "Stopped (volume $VOLUME kept)" ;;
	reset)
		docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
		docker volume rm "$VOLUME" >/dev/null 2>&1 || true
		log "Removed container and volume — next 'up' is a clean slate"
		;;
	*) echo "usage: $0 {up|reload|logs|shell|down|reset}" >&2; exit 1 ;;
esac
