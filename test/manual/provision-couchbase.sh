#!/usr/bin/env bash
# Provision the Couchbase resources expected by docs/manual-testing workflows.
# Run from the repository root against an already initialized local Couchbase node.
set -Eeuo pipefail

CB_HOST="${CB_HOST:-127.0.0.1}"
CB_USER="${CB_USER:-Administrator}"
CB_PASS="${CB_PASS:-password}"
CB_RAM_QUOTA_MB="${CB_RAM_QUOTA_MB:-256}"
VECTOR_DIMS="${CB_VECTOR_DIMS:-1536}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

MGMT_URL="${CB_MGMT_URL:-http://${CB_HOST}:8091}"
QUERY_URL="${CB_QUERY_URL:-http://${CB_HOST}:8093/query/service}"
FTS_URL="${CB_FTS_URL:-http://${CB_HOST}:8094}"

AUTH=(-u "${CB_USER}:${CB_PASS}")

tmp_files=()
cleanup() {
  for f in "${tmp_files[@]:-}"; do
    rm -f "$f"
  done
}
trap cleanup EXIT

json_tmp() {
  local f
  f="$(mktemp)"
  tmp_files+=("$f")
  printf '%s' "$f"
}

wait_for_url() {
  local label="$1"
  local url="$2"
  echo "==> waiting for ${label}"
  for _ in $(seq 1 120); do
    if curl -fsS "${AUTH[@]}" "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: timed out waiting for ${label} at ${url}" >&2
  return 1
}

require_initialized_cluster() {
  if ! curl -fsS "${AUTH[@]}" "${MGMT_URL}/pools/default" >/dev/null; then
    cat >&2 <<EOF
ERROR: Couchbase is not reachable or not initialized at ${MGMT_URL}.
Start and initialize a local Couchbase Server with Data, Query, Index, and Search services first.
For example, when using Docker:
  docker run -d --name n8n-couchbase-manual -p 8091-8096:8091-8096 -p 11210:11210 couchbase:latest
Then initialize it from the Couchbase UI or couchbase-cli with username '${CB_USER}' and a non-production password.
EOF
    return 1
  fi
}

ensure_bucket() {
  local bucket="$1"
  if curl -fsS "${AUTH[@]}" "${MGMT_URL}/pools/default/buckets/${bucket}" >/dev/null 2>&1; then
    echo "==> bucket ${bucket} already exists"
    return 0
  fi

  echo "==> creating bucket ${bucket}"
  curl -fsS "${AUTH[@]}" -X POST "${MGMT_URL}/pools/default/buckets" \
    --data-urlencode "name=${bucket}" \
    --data "bucketType=couchbase" \
    --data "ramQuotaMB=${CB_RAM_QUOTA_MB}" \
    --data "replicaNumber=0" \
    --data "flushEnabled=1" >/dev/null

  for _ in $(seq 1 60); do
    curl -fsS "${AUTH[@]}" "${MGMT_URL}/pools/default/buckets/${bucket}" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "ERROR: bucket ${bucket} was not visible after creation" >&2
  return 1
}

ensure_scope() {
  local bucket="$1"
  local scope="$2"
  local scopes_json
  scopes_json="$(json_tmp)"

  curl -fsS "${AUTH[@]}" "${MGMT_URL}/pools/default/buckets/${bucket}/scopes" -o "$scopes_json"
  if python3 - "$scopes_json" "$scope" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as fh:
    data = json.load(fh)
needle = sys.argv[2]
sys.exit(0 if any(s.get('name') == needle for s in data.get('scopes', [])) else 1)
PY
  then
    echo "==> scope ${bucket}.${scope} already exists"
    return 0
  fi

  echo "==> creating scope ${bucket}.${scope}"
  curl -fsS "${AUTH[@]}" -X POST "${MGMT_URL}/pools/default/buckets/${bucket}/scopes" \
    --data-urlencode "name=${scope}" >/dev/null
  sleep 2
}

ensure_collection() {
  local bucket="$1"
  local scope="$2"
  local collection="$3"
  local scopes_json
  scopes_json="$(json_tmp)"

  curl -fsS "${AUTH[@]}" "${MGMT_URL}/pools/default/buckets/${bucket}/scopes" -o "$scopes_json"
  if python3 - "$scopes_json" "$scope" "$collection" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as fh:
    data = json.load(fh)
scope_name, collection_name = sys.argv[2], sys.argv[3]
for scope in data.get('scopes', []):
    if scope.get('name') == scope_name:
        sys.exit(0 if any(c.get('name') == collection_name for c in scope.get('collections', [])) else 1)
sys.exit(1)
PY
  then
    echo "==> collection ${bucket}.${scope}.${collection} already exists"
    return 0
  fi

  echo "==> creating collection ${bucket}.${scope}.${collection}"
  curl -fsS "${AUTH[@]}" -X POST "${MGMT_URL}/pools/default/buckets/${bucket}/scopes/${scope}/collections" \
    --data-urlencode "name=${collection}" >/dev/null
  sleep 3
}

run_query() {
  local label="$1"
  local statement="$2"
  local out
  out="$(json_tmp)"
  echo "==> ${label}"
  curl -fsS "${AUTH[@]}" -X POST "${QUERY_URL}" \
    --data-urlencode "statement=${statement}" \
    --data "timeout=120s" \
    -o "$out"
  if ! python3 - "$out" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as fh:
    data = json.load(fh)
status = data.get('status')
if status in {'success', 'completed'}:
    sys.exit(0)
print(json.dumps(data, indent=2), file=sys.stderr)
sys.exit(1)
PY
  then
    echo "ERROR: query failed for ${label}" >&2
    return 1
  fi
}

run_optional_query() {
  local label="$1"
  local statement="$2"
  if ! run_query "$label" "$statement"; then
    echo "WARNING: ${label} failed; this usually means the local Couchbase version does not support SQL++ vector indexes yet." >&2
    echo "         Query Vector Store manual workflows require Couchbase Server 8.0+ with Query/Index vector support." >&2
  fi
}

create_primary_index() {
  local bucket="$1"
  local scope="$2"
  local collection="$3"
  run_query "creating primary index on ${bucket}.${scope}.${collection}" \
    "CREATE PRIMARY INDEX IF NOT EXISTS ON \`${bucket}\`.\`${scope}\`.\`${collection}\`;"
}

create_query_vector_index() {
  local index_name="$1"
  local bucket="$2"
  local scope="$3"
  local collection="$4"
  run_optional_query "creating SQL++ vector index ${index_name}" \
    "CREATE VECTOR INDEX IF NOT EXISTS \`${index_name}\` ON \`${bucket}\`.\`${scope}\`.\`${collection}\`(\`embedding\` VECTOR) INCLUDE (\`description\`) WITH {\"dimension\": ${VECTOR_DIMS}, \"similarity\": \"DOT\"};"
}

write_core_search_index() {
  local output="$1"
  cat >"$output" <<'JSON'
{
  "name": "manual-core-search",
  "type": "fulltext-index",
  "sourceType": "gocbcore",
  "sourceName": "test-insert",
  "planParams": {
    "indexPartitions": 1,
    "numReplicas": 0
  },
  "params": {
    "doc_config": {
      "mode": "scope.collection.type_field",
      "type_field": "type"
    },
    "mapping": {
      "default_analyzer": "standard",
      "default_datetime_parser": "dateTimeOptional",
      "default_field": "_all",
      "default_mapping": {
        "dynamic": false,
        "enabled": false
      },
      "default_type": "_default",
      "index_dynamic": true,
      "store_dynamic": true,
      "type_field": "_type",
      "types": {
        "data.data": {
          "dynamic": true,
          "enabled": true
        }
      }
    },
    "store": {
      "indexType": "scorch"
    }
  }
}
JSON
}

strip_cluster_ids() {
  local input="$1"
  local output="$2"
  python3 - "$input" "$output" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as fh:
    data = json.load(fh)
for key in ('uuid', 'sourceUUID'):
    data.pop(key, None)
with open(sys.argv[2], 'w', encoding='utf-8') as fh:
    json.dump(data, fh, indent=2)
    fh.write('\n')
PY
}

put_fts_index() {
  local label="$1"
  local url="$2"
  local body="$3"
  local result code
  result="$(json_tmp)"
  echo "==> creating Search index ${label}"
  code="$(curl -sS -o "$result" -w '%{http_code}' "${AUTH[@]}" -X PUT "$url" \
    -H 'Content-Type: application/json' \
    -H 'cache-control: no-cache' \
    -d @"$body")"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    if [[ "$code" = "400" ]] && grep -q "same name already exists" "$result"; then
      echo "    ${label} already exists"
      return 0
    fi
    echo "ERROR: failed to create Search index ${label} (HTTP ${code})" >&2
    cat "$result" >&2 || true
    return 1
  fi
}

create_fts_indexes() {
  local core_json insert_json poi_json
  core_json="$(json_tmp)"
  insert_json="$(json_tmp)"
  poi_json="$(json_tmp)"

  write_core_search_index "$core_json"
  strip_cluster_ids "${REPO_ROOT}/docs/manual-testing/indexes/search-vector-store-test-insert-index.json" "$insert_json"
  strip_cluster_ids "${REPO_ROOT}/docs/manual-testing/indexes/search-vector-store-poi-index.json" "$poi_json"

  put_fts_index "manual-core-search" "${FTS_URL}/api/index/manual-core-search" "$core_json"
  put_fts_index "test-insert scoped vector index" "${FTS_URL}/api/bucket/test-insert/scope/data/index/test-insert" "$insert_json"
  put_fts_index "poi-index scoped vector index" "${FTS_URL}/api/bucket/travel-agent/scope/vectors/index/poi-index" "$poi_json"
}

wait_for_fts_index() {
  local label="$1"
  local count_url="$2"
  echo "==> waiting for Search pindex ${label}"
  for _ in $(seq 1 120); do
    if curl -fsS "${AUTH[@]}" "$count_url" >/dev/null 2>&1; then
      echo "    ${label} is queryable"
      return 0
    fi
    sleep 2
  done
  echo "ERROR: Search index ${label} did not become queryable; Couchbase may report 'pindex not available'." >&2
  echo "       Do not continue with manual workflow validation until this is fixed." >&2
  return 1
}

main() {
  require_initialized_cluster
  wait_for_url "Query service" "${QUERY_URL}?statement=SELECT%201"
  wait_for_url "Search service" "${FTS_URL}/api/index"

  ensure_bucket "test-insert"
  ensure_scope "test-insert" "data"
  ensure_collection "test-insert" "data" "data"

  ensure_bucket "travel-agent"
  ensure_scope "travel-agent" "vectors"
  ensure_collection "travel-agent" "vectors" "points-of-interest"

  create_primary_index "test-insert" "data" "data"
  create_primary_index "travel-agent" "vectors" "points-of-interest"

  create_query_vector_index "manual_test_insert_query_vector_idx" "test-insert" "data" "data"
  create_query_vector_index "manual_poi_query_vector_idx" "travel-agent" "vectors" "points-of-interest"

  create_fts_indexes
  wait_for_fts_index "manual-core-search" "${FTS_URL}/api/index/manual-core-search/count"
  wait_for_fts_index "test-insert" "${FTS_URL}/api/bucket/test-insert/scope/data/index/test-insert/count"
  wait_for_fts_index "poi-index" "${FTS_URL}/api/bucket/travel-agent/scope/vectors/index/poi-index/count"

  cat <<EOF
==> manual Couchbase provisioning complete
Buckets/scopes/collections:
  - test-insert.data.data
  - travel-agent.vectors.points-of-interest
Search indexes:
  - manual-core-search
  - test-insert.data.test-insert
  - travel-agent.vectors.poi-index
SQL++ vector indexes attempted:
  - manual_test_insert_query_vector_idx
  - manual_poi_query_vector_idx
EOF
}

main "$@"
