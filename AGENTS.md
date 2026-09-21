# Agent instructions for `n8n-nodes-couchbase`

This repository is a Couchbase community-node package for n8n. Follow these repo-specific instructions in addition to the Kanban task body and loaded Hermes skills.

## Dependency-upgrade scope

Dependency maintenance in this repo is not limited to the Couchbase Node.js SDK. For Kanban task `t_f3bd2fed` and future dependency-upgrade work:

1. Prioritize `couchbase` SDK currency first.
2. Also check and, where safely compatible, update the surrounding n8n/LangChain ecosystem used by the plugin:
   - `n8n-workflow` peer dependency and any n8n-related dev/runtime packages.
   - `@langchain/*`, `langchain`, vector-store/memory related dependencies, and resolver overrides.
   - TypeScript, eslint/prettier, gulp/build tooling, and package-manager metadata only when needed and validated.
3. Preserve pnpm. Do not switch package managers.
4. Treat n8n compatibility as a first-class validation gate, not just a peer-dependency number.

Known baseline from manual testing: n8n `2.9.2` was usable for the current manual-test setup. The npm latest observed during this instruction update was `2.39.7` (`npm view n8n version` on 2026-09-17 UTC); the user had previously seen about `2.39.5`. Agents should check the current latest again when doing the work.

## n8n-version compatibility requirement

When updating dependencies, attempt to run and manually validate this plugin against the latest stable n8n Docker image/version, not only the older known-good baseline.

Recommended version matrix:

- Baseline/control: n8n `2.9.2` if a regression comparison is needed.
- Target: latest stable n8n from `npm view n8n version` / Docker tag at execution time.

If latest n8n fails:

1. Capture the exact error from Docker/n8n logs and the failing workflow/node.
2. Determine whether the failure is due to this plugin, n8n API changes, LangChain API changes, test data/index setup, or credentials/environment.
3. Prefer a narrow compatibility fix when feasible.
4. If not feasible in this task, block with `manual_migration_required` or the closest standard blocker, and explicitly state whether `2.9.2` still works.

## Manual Docker validation is required

Automated tests are necessary but insufficient. The plugin must also be exercised manually through n8n running in Docker (or an equivalent local n8n runtime that uses the packaged node exactly as users would install it).

Manual validation must test every shipped node from `package.json`:

- `n8n-nodes-couchbase.couchbase` / `nodes/Couchbase` — core Couchbase operations (KV CRUD and SQL++/query/search paths present in the node).
- `n8n-nodes-couchbase.vectorStoreCouchbaseQuery` — Query/Hyperscale vector-store node.
- `n8n-nodes-couchbase.vectorStoreCouchbaseSearch` — Search-service vector-store node, if supported by the local Couchbase setup.
- `n8n-nodes-couchbase.memoryCouchbaseChat` — chat-memory node.
- `credentials/CouchbaseApi.credentials.ts` — credential validation and bucket/scope/collection resource locator behavior.

For each node, record:

- n8n version and Docker image/tag.
- Plugin package/build used (`pnpm build`, packed tarball, mounted custom node, etc.).
- Couchbase Server/Capella target and required buckets/scopes/collections/indexes.
- Workflow name or workflow JSON path.
- Operation modes tested.
- Result: pass/fail, error summary, and whether the failure is a regression from n8n `2.9.2`.

## Workflow fixtures

Keep reusable manual-test workflow JSON under `docs/manual-testing/workflows/` so future agents can import them into n8n instead of reconstructing workflows by hand.

The user-provided Query Vector Store fixture is saved at:

- `docs/manual-testing/workflows/query-vector-store-test-all.workflow.json`

Additional manual-test fixtures and setup assets are documented in `docs/manual-testing/README.md`.

When manually validating either vector-store all-in-one fixture:

- `docs/manual-testing/workflows/query-vector-store-test-all.workflow.json`
- `docs/manual-testing/workflows/search-vector-store-test-all.workflow.json`

the manual trigger is intentionally not connected to every test branch at once. Reconnect it step-by-step:

1. Connect the manual trigger to **Get Many** and run it; verify documents are returned.
2. Reconnect the trigger to **Insert** and run it.
3. Copy the ID from the inserted document into **Update Documents**, reconnect the trigger to **Update Documents**, and run it.
4. At the bottom of each workflow, test both vector retrieval paths independently: the Vector Store QA Tool path and the Retrieve As Tool / AI Agent path. Verify both paths return responses.

`docs/manual-testing/workflows/core-nodes-test-all.workflow.json` covers the remaining core Couchbase and chat-memory nodes: KV create/read/upsert/delete, SQL++ query, FTS index creation, basic FTS search, advanced raw JSON search, and `MemoryCouchbaseChat` via n8n's Chat Memory Manager.

Reusable Search Vector Store FTS/vector index definitions live under `docs/manual-testing/indexes/`. Import them through Couchbase Search, or remove cluster-specific `uuid` / `sourceUUID` fields first if the target cluster rejects an exported definition.

Use that workflow as the pattern for other node fixtures: include a manual trigger, realistic Couchbase credentials placeholders, and enough connected n8n LangChain nodes to exercise the actual plugin node mode.

## Data and secrets

- Never commit API keys, n8n credential exports with real credential IDs/secrets, `.env` files, Docker volumes, logs, or screenshots.
- Use placeholder credentials in committed workflow fixtures. If exporting from a real n8n instance, scrub credential IDs/names unless they are intentionally inert examples.
- Local Couchbase default on this machine is usually `couchbase://localhost` with `Administrator` / `password`, but agents must verify live state before using it.
- OpenAI-dependent manual workflows require an available n8n OpenAI credential; if unavailable, record `blocked_missing_secrets` and still run the nearest local plugin smoke test that does not require OpenAI.

## PR and Kanban reporting

Any PR for dependency work must include separate sections for:

- Couchbase SDK status.
- Surrounding n8n/LangChain ecosystem updates attempted or intentionally skipped.
- Automated validation results.
- Manual Docker validation against latest n8n and, if used, baseline n8n `2.9.2`.
- Per-node manual validation table.
- Release-process classification and maintainer action.

Update Kanban task `t_f3bd2fed` with the same high-level evidence before moving it to Done.
