# Manual testing assets

Reusable n8n workflow fixtures live in `docs/manual-testing/workflows/` and can be imported into a clean n8n instance created with `test/manual/fresh-n8n.sh`.

## Workflows

- `query-vector-store-test-all.workflow.json` exercises the Couchbase Query Vector Store modes.
- `search-vector-store-test-all.workflow.json` exercises the Couchbase Search Vector Store modes.
- `core-nodes-test-all.workflow.json` exercises the remaining Couchbase node modes: repeatable KV seed/read/upsert/delete, SQL++ query, FTS index upsert, basic FTS search, advanced raw JSON search, and the Couchbase Chat Memory node through n8n's Chat Memory Manager. The FTS index step continues when the index already exists, and the workflow includes a short wait after creating/updating the Search index so Couchbase can publish the index before the search nodes run. The cleanup/delete node is intentionally disconnected; run cleanup manually only when you want to remove the seed document.

## Couchbase setup for manual workflows

The committed workflow fixtures expect a real Couchbase cluster. Do not improvise bucket or index names when gathering manual evidence; use the resource matrix below so the resource locators in the imported workflows resolve consistently.

For local validation, use a non-production Couchbase Server with these services enabled:

- Data
- Query
- Index
- Search / FTS

The Query Vector Store fixture also requires Couchbase Server 8.0+ with SQL++ vector index support. The Search Vector Store fixture uses Search-service vector indexes and requires the Search service to be healthy before n8n executes vector retrieval nodes.

### Quick local provisioning

Start or reuse an initialized Couchbase node, then run the helper from the repository root:

```bash
CB_HOST=127.0.0.1 \
CB_USER=Administrator \
CB_PASS=password \
bash test/manual/provision-couchbase.sh
```

The script is idempotent for existing local resources. It creates the required buckets, scopes, collections, primary indexes, Search indexes, and SQL++ vector indexes where the connected Couchbase version supports them. It also waits for Search index count endpoints to respond before reporting success; if it times out, do not continue to n8n workflow execution yet.

The helper expects the cluster to already be initialized. For a one-off Docker node, initialize the cluster with Data, Query, Index, and Search services before running the script, for example through the Couchbase UI or `couchbase-cli cluster-init`.

### Required resources

| Workflow fixture | Resource type | Name / path | Purpose |
| --- | --- | --- | --- |
| `core-nodes-test-all.workflow.json` | Bucket/scope/collection | `test-insert.data.data` | KV, SQL++, chat memory, and basic Search fixture data |
| `core-nodes-test-all.workflow.json` | Cluster-level Search index | `manual-core-search` | Basic and advanced FTS search nodes |
| `query-vector-store-test-all.workflow.json` | Bucket/scope/collection | `test-insert.data.data` | Insert and update Query Vector Store documents |
| `query-vector-store-test-all.workflow.json` | Bucket/scope/collection | `travel-agent.vectors.points-of-interest` | Query Vector Store retrieval fixture data |
| `query-vector-store-test-all.workflow.json` | SQL++ vector indexes | `manual_test_insert_query_vector_idx`, `manual_poi_query_vector_idx` | Query-service vector retrieval over `embedding` |
| `search-vector-store-test-all.workflow.json` | Scoped Search vector index | `test-insert` on `test-insert.data` | Insert and update Search Vector Store documents |
| `search-vector-store-test-all.workflow.json` | Scoped Search vector index | `poi-index` on `travel-agent.vectors` | Search Vector Store retrieval fixture data |

Both vector workflows use:

- vector field: `embedding`
- text field: `description`
- default embedding dimensions: `1536` for OpenAI `text-embedding-3-small`

If you change the embedding model for manual testing, recreate the vector indexes with matching dimensions before running retrieval nodes.

### Index definitions

Reusable Search Vector Store index definitions are under `docs/manual-testing/indexes/`:

- `search-vector-store-test-insert-index.json` for bucket `test-insert`, scope/collection `data.data`, index `test-insert`.
- `search-vector-store-poi-index.json` for bucket `travel-agent`, scope/collection `vectors.points-of-interest`, index `poi-index`.

These are exported Couchbase Search definitions for the manual-test datasets. If Couchbase rejects an imported definition because `uuid` or `sourceUUID` belongs to another cluster, remove those generated fields and retry creation against the target cluster. The provisioning helper strips those generated fields automatically.

The core Search index used by `core-nodes-test-all.workflow.json` is named `manual-core-search` and maps `test-insert.data.data`. The workflow can create it during execution, but pre-creating it with `test/manual/provision-couchbase.sh` is preferred because the helper verifies that Search has assigned a queryable pindex before n8n reaches the Search nodes.

### Readiness checks before running n8n

Before importing or executing workflows, verify all of the following:

```bash
# Query service accepts statements.
curl -fsS -u Administrator:password \
  http://127.0.0.1:8093/query/service \
  --data-urlencode 'statement=SELECT 1;'

# Required collections exist.
curl -fsS -u Administrator:password \
  http://127.0.0.1:8091/pools/default/buckets/test-insert/scopes
curl -fsS -u Administrator:password \
  http://127.0.0.1:8091/pools/default/buckets/travel-agent/scopes

# Search indexes are queryable. These calls must return successfully, even if count is 0.
curl -fsS -u Administrator:password \
  http://127.0.0.1:8094/api/index/manual-core-search/count
curl -fsS -u Administrator:password \
  http://127.0.0.1:8094/api/bucket/test-insert/scope/data/index/test-insert/count
curl -fsS -u Administrator:password \
  http://127.0.0.1:8094/api/bucket/travel-agent/scope/vectors/index/poi-index/count
```

Search index creation returning HTTP 200 is not enough. Wait until the count/query endpoint works. If Couchbase reports `pindex not available`, the index exists in metadata but is not ready for workflow execution.

### Troubleshooting

- `pindex not available`: keep n8n stopped or leave the workflow unexecuted until the Search count endpoint succeeds. Recheck that the Search service is enabled, the index endpoint matches the fixture's index scope, and the bucket/scope/collection path exists. If the error persists after two focused repair attempts, stop manual validation and report the setup blocker with the exact Couchbase error instead of continuing open-ended debugging.
- Search index import fails with `uuid` or `sourceUUID`: remove those generated fields from the exported JSON and retry, or use `test/manual/provision-couchbase.sh` which strips them.
- Search vector retrieval returns dimension errors: recreate the Search vector indexes with dimensions matching the embedding model used by the n8n OpenAI Embeddings credential.
- Query Vector Store nodes fail on `CREATE VECTOR INDEX` or vector query syntax: verify the cluster is Couchbase Server 8.0+ with Query and Index services that support SQL++ vector indexes. Search-service vector indexes are not a substitute for Query Vector Store indexes.
- Bucket creation fails locally: reduce existing local buckets or increase the cluster RAM quota; single-node manual validation should use zero replicas.

## Query/Search Vector Store manual procedure

The Query and Search Vector Store all-in-one fixtures intentionally do not keep the manual trigger connected to every node at once. When validating either fixture by hand:

1. Connect the manual trigger to `Get Many` and execute the workflow; verify documents are returned.
2. Reconnect the manual trigger to `Insert` and execute it.
3. Copy the ID of the inserted document, set it on `Update Documents`, reconnect the manual trigger to `Update Documents`, and execute it.
4. At the bottom of the workflow, test both vector retrieval paths independently: the Vector Store QA Tool path and the Retrieve As Tool / AI Agent path. Verify both return responses.
