# Manual testing assets

Reusable n8n workflow fixtures live in `docs/manual-testing/workflows/` and can be imported into a clean n8n instance created with `test/manual/fresh-n8n.sh`.

## Workflows

- `query-vector-store-test-all.workflow.json` exercises the Couchbase Query Vector Store modes.
- `search-vector-store-test-all.workflow.json` exercises the Couchbase Search Vector Store modes.
- `core-nodes-test-all.workflow.json` exercises the remaining Couchbase node modes: KV create/read/upsert/delete, SQL++ query, FTS index creation, basic FTS search, advanced raw JSON search, and the Couchbase Chat Memory node through n8n's Chat Memory Manager. The cleanup/delete node is intentionally disconnected so Search can finish indexing before the test document is removed; run cleanup manually after verifying both search nodes, or before rerunning after a failed validation.

## Query/Search Vector Store manual procedure

The Query and Search Vector Store all-in-one fixtures intentionally do not keep the manual trigger connected to every node at once. When validating either fixture by hand:

1. Connect the manual trigger to `Get Many` and execute the workflow; verify documents are returned.
2. Reconnect the manual trigger to `Insert` and execute it.
3. Copy the ID of the inserted document, set it on `Update Documents`, reconnect the manual trigger to `Update Documents`, and execute it.
4. At the bottom of the workflow, test both vector retrieval paths independently: the Vector Store QA Tool path and the Retrieve As Tool / AI Agent path. Verify both return responses.

## Index definitions

Reusable Search Vector Store index definitions are under `docs/manual-testing/indexes/`:

- `search-vector-store-test-insert-index.json` for bucket `test-insert`, scope/collection `data.data`, index `test-insert`.
- `search-vector-store-poi-index.json` for bucket `travel-agent`, scope/collection `vectors.points-of-interest`, index `poi-index`.

These are exported Couchbase Search definitions for the manual-test datasets. If Couchbase rejects an imported definition because `uuid` or `sourceUUID` belongs to another cluster, remove those generated fields and retry creation against the target cluster.
