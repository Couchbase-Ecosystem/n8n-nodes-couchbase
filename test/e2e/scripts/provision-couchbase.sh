#!/bin/bash
# Runs INSIDE the couchbase container. Brings a fresh node up to a queryable
# bucket/scope/collection so the E2E workflows have somewhere to write.
set -euo pipefail

CB_USER="${CB_USER:-Administrator}"
CB_PASS="${CB_PASS:-password}"
BUCKET="${CB_BUCKET:-testbucket}"
SCOPE="${CB_SCOPE:-testscope}"
COLLECTION="${CB_COLLECTION:-testcollection}"
VECTOR_INDEX="${CB_VECTOR_INDEX:-e2e-vector-index}"
# Must match the embedding model used by the vector-store tests
# (OpenAI text-embedding-3-small = 1536).
VECTOR_DIMS="${CB_VECTOR_DIMS:-1536}"
CB_RAM="${CB_RAM:-1024}"
CB_INDEX_RAM="${CB_INDEX_RAM:-512}"
CB_FTS_RAM="${CB_FTS_RAM:-512}"
CLI=/opt/couchbase/bin/couchbase-cli

echo "==> waiting for the web console"
for _ in $(seq 1 120); do
  curl -sf http://127.0.0.1:8091/ui/index.html >/dev/null 2>&1 && break
  sleep 1
done

# Idempotent: a re-run against an initialised cluster should not fail the suite.
if curl -sf -u "$CB_USER:$CB_PASS" http://127.0.0.1:8091/pools/default >/dev/null 2>&1; then
  echo "==> cluster already initialised"
else
  echo "==> cluster-init"
  "$CLI" cluster-init -c 127.0.0.1 \
    --cluster-username "$CB_USER" --cluster-password "$CB_PASS" \
    --services data,index,query,fts \
    --cluster-ramsize "$CB_RAM" --cluster-index-ramsize "$CB_INDEX_RAM" \
    --cluster-fts-ramsize "$CB_FTS_RAM" \
    --index-storage-setting default
fi

echo "==> waiting for the cluster to report healthy"
for _ in $(seq 1 120); do
  curl -sf -u "$CB_USER:$CB_PASS" http://127.0.0.1:8091/pools/default >/dev/null 2>&1 && break
  sleep 1
done

if "$CLI" bucket-list -c 127.0.0.1 -u "$CB_USER" -p "$CB_PASS" | grep -qx "$BUCKET"; then
  echo "==> bucket $BUCKET already exists"
else
  echo "==> creating bucket $BUCKET"
  "$CLI" bucket-create -c 127.0.0.1 -u "$CB_USER" -p "$CB_PASS" \
    --bucket "$BUCKET" --bucket-type couchbase --bucket-ramsize 256 --wait
fi

echo "==> creating scope/collection $SCOPE.$COLLECTION"
"$CLI" collection-manage -c 127.0.0.1 -u "$CB_USER" -p "$CB_PASS" \
  --bucket "$BUCKET" --create-scope "$SCOPE" 2>/dev/null || echo "    scope exists"
sleep 2
"$CLI" collection-manage -c 127.0.0.1 -u "$CB_USER" -p "$CB_PASS" \
  --bucket "$BUCKET" --create-collection "$SCOPE.$COLLECTION" 2>/dev/null || echo "    collection exists"
sleep 3

echo "==> creating primary index"
for _ in $(seq 1 40); do
  if curl -sf -u "$CB_USER:$CB_PASS" http://127.0.0.1:8093/query/service \
      --data-urlencode "statement=CREATE PRIMARY INDEX IF NOT EXISTS ON \`$BUCKET\`.\`$SCOPE\`.\`$COLLECTION\`" \
      >/dev/null 2>&1; then
    echo "    primary index ready"
    break
  fi
  sleep 2
done

echo "==> creating scoped vector search index $VECTOR_INDEX (${VECTOR_DIMS}d)"
# The vector-store nodes default to `useScopedIndex: true`, so this has to be a
# scope-level FTS index rather than a cluster-level one.
cat > /tmp/vector-index.json <<JSON
{
  "type": "fulltext-index",
  "name": "$VECTOR_INDEX",
  "sourceType": "gocbcore",
  "sourceName": "$BUCKET",
  "planParams": { "indexPartitions": 1, "numReplicas": 0 },
  "params": {
    "doc_config": { "docid_prefix_delim": "", "docid_regexp": "", "mode": "scope.collection.type_field", "type_field": "type" },
    "mapping": {
      "default_analyzer": "standard",
      "default_datetime_parser": "dateTimeOptional",
      "default_field": "_all",
      "default_mapping": { "dynamic": true, "enabled": false },
      "default_type": "_default",
      "docvalues_dynamic": false,
      "index_dynamic": true,
      "store_dynamic": true,
      "type_field": "_type",
      "types": {
        "$SCOPE.$COLLECTION": {
          "dynamic": false,
          "enabled": true,
          "properties": {
            "embedding": { "enabled": true, "dynamic": false,
              "fields": [{ "dims": $VECTOR_DIMS, "index": true, "name": "embedding", "similarity": "dot_product", "type": "vector", "vector_index_optimized_for": "recall" }] },
            "text": { "enabled": true, "dynamic": false,
              "fields": [{ "include_in_all": true, "index": true, "name": "text", "store": true, "type": "text" }] },
            "metadata": { "dynamic": true, "enabled": true }
          }
        }
      }
    },
    "store": { "indexType": "scorch", "segmentVersion": 16 }
  },
  "sourceParams": {}
}
JSON

for _ in $(seq 1 30); do
  code=$(curl -s -o /tmp/vector-index-result.json -w "%{http_code}" -u "$CB_USER:$CB_PASS" -X PUT \
    "http://127.0.0.1:8094/api/bucket/$BUCKET/scope/$SCOPE/index/$VECTOR_INDEX" \
    -H 'Content-Type: application/json' -H 'cache-control: no-cache' \
    -d @/tmp/vector-index.json || echo 000)
  if [ "$code" = "200" ]; then echo "    vector index ready"; break; fi
  sleep 2
done
if [ "$code" != "200" ]; then
  echo "    WARNING: could not create the vector index (HTTP $code):"
  cat /tmp/vector-index-result.json 2>/dev/null || true
fi

echo "==> provisioning complete"
