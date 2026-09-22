# Testing strategy

The two questions this suite exists to answer, on every change:

1. **Can the package still be installed into n8n as a community node?**
2. **Does it still work once installed?**

Everything below is arranged so that the cheapest check that can answer a question runs first.

| Layer | What it proves | Runtime | Needs Docker | CI workflow |
| --- | --- | --- | --- | --- |
| 1. Static | Code compiles, lints against n8n's community-node rules, is formatted | ~30s | no | `ci.yml` |
| 2. Unit | Connection caching, validation and helper logic behave | ~3s | no | `ci.yml` |
| 3. Package contract | The published tarball is a well-formed n8n community package | ~5s | no | `ci.yml` |
| 4. E2E | n8n really installs it, and the Couchbase node really talks to Couchbase | ~5–8 min | yes | `e2e.yml` |
| 5. Release scan | The published package passes n8n's verification scanner | ~1 min | no | `verify-published.yml` |

Releases run layers 1–4 again before publishing — `release.yml` calls `ci.yml` and
`e2e.yml` as reusable workflows rather than copying them, so the release gate cannot drift
from the pull-request gate. See [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

## Running it

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck   # layer 1
pnpm build                                          # required by layers 3 and 4
pnpm test                                           # layers 2 and 3
pnpm test:e2e                                       # layer 4 (needs Docker)
```

Useful E2E knobs:

```bash
E2E_KEEP=1 pnpm test:e2e             # leave the stack up for debugging
N8N_IMAGE_TAG=1.123.4 pnpm test:e2e  # pin the n8n version under test
COUCHBASE_IMAGE=couchbase/server:enterprise-7.6.7 pnpm test:e2e  # pin Couchbase
E2E_SKIP_SEARCH=1 pnpm test:e2e      # skip the full-text search tests
N8N_PORT=15678 VERDACCIO_PORT=14873 pnpm test:e2e   # avoid local port clashes

# Vector-store tests need an embeddings model; without a key they are skipped loudly.
OPENAI_API_KEY=sk-... pnpm test:e2e
```

With `E2E_KEEP=1` the driver is re-runnable on its own:
`E2E_N8N_URL=http://127.0.0.1:5678 node test/e2e/run-e2e.mjs`.

To drive a real n8n UI by hand against the local build, see [Manual testing](#manual-testing-testmanual).

---

## Layer 1 — Static

`pnpm lint` already runs `eslint-plugin-n8n-nodes-base` with the `community`, `nodes` and
`credentials` rule sets. Those rules encode n8n's own review checklist (naming, display
options, credential shape), so they are the cheapest proxy for "n8n will accept this node".

`format:check` is deliberately scoped to `nodes` and `credentials`, matching the existing
`format` script. `utils/` currently has two files that predate Prettier; widening both
scripts together after a one-off `prettier utils --write` is a tidy follow-up.

## Layer 2 — Unit (`test/unit`)

Jest with `ts-jest`, mocking `IExecuteFunctions` via `jest-mock-extended`
(`test/helpers/mock-context.ts`). The targets are the pieces with real branching:

- **`connectToCouchbase`** — the highest-value unit target. It memoises the cluster in
  *module scope*, so the tests re-import it per case via `jest.isolateModules` and pin:
  reuse on unchanged credentials, close-and-reconnect on changed credentials, error
  wrapping, and — importantly — that a failed connection is not cached.
- **`validateBucketScopeCollection`** — every rejection path and its message.
- **`getSessionId`** — expression evaluation, the `$json.sessionId` fallback, coercion.
- **`assertParamIs*`** — the vector-store parameter guards.

These need neither a cluster nor a build, so they are the right place to grow coverage.

## Layer 3 — Package contract (`test/package`)

Runs against `dist/` and against the exact file list `npm publish` would ship
(`npm pack --dry-run --json`). It catches the class of breakage that is invisible locally
but fatal on install:

- every path in `package.json#n8n` exists **in the tarball**, not just on disk
- the `n8n-community-node-package` keyword and `n8nNodesApiVersion` are intact
- every compiled node loads, instantiates, and has the fields the editor needs
- node names are unique
- nodes only reference credentials the package actually ships
- every `file:` icon reference resolves
- no TypeScript sources leak into the tarball
- `n8n-workflow` stays out of runtime `dependencies` (see the note below)

## Layer 4 — E2E (`test/e2e`)

`test/e2e/run.sh` builds and packs the package, brings up a three-service stack, and runs
`run-e2e.mjs` against it.

```
couchbase  ──────────────┐
                         ├──►  n8n  ◄── installs n8n-nodes-couchbase
verdaccio (local npm) ───┘
```

The flow mirrors what a user does in the n8n UI:

1. `pnpm build` + `npm pack` produce the real tarball.
2. The tarball is published to a throwaway **Verdaccio** registry, which the stack makes
   n8n install from. That is harder than it sounds, and getting it wrong is silent:

   n8n's installer passes `--registry=https://registry.npmjs.org` **on the npm command
   line** (changing it via `N8N_COMMUNITY_PACKAGES_REGISTRY` is Enterprise-licensed), and a
   command-line flag beats `NPM_CONFIG_REGISTRY`. An earlier version of this suite set
   `NPM_CONFIG_REGISTRY` and looked like it worked — it was installing the *published*
   package from npmjs the whole time, and would have passed regardless of what was in the
   working tree.

   So the stack impersonates that hostname instead: an nginx service carries the network
   alias `registry.npmjs.org`, terminates TLS with a self-signed certificate
   (`NPM_CONFIG_STRICT_SSL=false` in n8n), and forwards to Verdaccio. Verdaccio sits on a
   **separate network** without that alias, so its own uplink still reaches the real
   registry rather than looping back on itself.

   The most recent release older than the local version is also fetched and published
   alongside, under the `previous` dist-tag (npm refuses to move `latest` backwards, and
   `latest` has to stay on the build under test). That is what makes the upgrade test
   possible.

   **If the install ever starts succeeding without the proxy, be suspicious** — that means
   it is reaching npmjs again and the suite has stopped testing your changes.
3. n8n installs it via `POST /rest/community-packages` — **n8n's own installer**, not a
   hand-rolled `npm install`.
4. The suite asserts n8n registered every node the package declares and that the editor
   can see them (`/types/nodes.json`).
5. Credentials and workflows are created over n8n's REST API, then executed with
   `n8n execute --id=<id>` inside the container, asserting per-node output.

### Two things worth knowing about that design

**n8n installs with `--ignore-scripts`.** Its installer runs
`npm install --bin-links=false --install-strategy=shallow --ignore-scripts=true --package-lock=false`.
That matters: a plain `npm install` of this package inside the n8n Docker image *fails*,
because `isolated-vm` (pulled in transitively) tries to compile with node-gyp and the
hardened n8n image has no Python or build toolchain. With n8n's real flags it installs
fine, because the Couchbase SDK ships prebuilt musl/glibc binaries as optional packages.
**Any install test that does not use n8n's flags — or better, n8n's API — will report a
failure that users never actually hit.** This suite goes through the API.

**Pointing n8n at a local registry.** `N8N_COMMUNITY_PACKAGES_REGISTRY` is gated behind an
Enterprise licence (`feat:communityNodes:customRegistry`). Since n8n shells out to `npm`,
the stack sets `NPM_CONFIG_REGISTRY` instead, which redirects npm itself and works on the
community licence.

### What the E2E asserts

**Install & upgrade** — owner setup; installing the *previous published release*; then
letting n8n upgrade it in place to the build under test via `PATCH /rest/community-packages`,
checking the reported version and the installed-package list; node-type registration and
editor visibility. A clean install never exercises the upgrade path an existing user
actually takes, so the suite installs the old version first.

**Function** — create → read → delete round-trip; SQL++ query convergence; upsert
overwrite; a missing document failing the workflow; an invalid collection producing a
*useful* error; full-text index creation, indexing, retrieval, and advanced raw-JSON mode.

**Editor** — all four resource-locator dropdowns (`bucket`, `scope`, `collection`, search
index) through `POST /rest/dynamic-node-parameters/resource-locator-results`, the same
endpoint the editor calls. These matter: if a `listSearch` method breaks, saved workflows
keep running but nobody can configure a new node, so no other layer would notice.

**Chat memory** — messages inserted and loaded through the Couchbase memory node via n8n's
Chat Memory Manager, plus session isolation. Needs no model.

**Vector stores** — insert and semantic retrieval through the Search node, and SQL++
retrieval through the Query node. Needs `OPENAI_API_KEY`; skipped loudly without one.

## Layer 5 — Release scan

`@n8n/scan-community-package` is what n8n runs against community nodes before marking them
verified. It inspects the published artefact, so it runs on release, not on PRs.

---

## Manual testing (`test/manual`)

The layers above gate merges. This is for the times you need to click through the UI
yourself — checking how a field renders, whether an agent picks the right tool, or
reproducing something a user reported.

`test/manual/fresh-n8n.sh` gives you a clean n8n in Docker with the **local** build
installed as a community node:

```bash
./test/manual/fresh-n8n.sh up       # build, pack, install, start
./test/manual/fresh-n8n.sh reload   # after a code change
./test/manual/fresh-n8n.sh logs     # follow the container logs
./test/manual/fresh-n8n.sh shell    # shell into the container
./test/manual/fresh-n8n.sh down     # stop, keep your workflows
./test/manual/fresh-n8n.sh reset    # delete the volume too — clean slate
```

It comes up on <http://localhost:5679> and asks you to create an owner account, since the
instance is brand new. Overrides: `N8N_IMAGE_TAG`, `N8N_PORT`, `N8N_VOLUME`, `N8N_CONTAINER`.

Four things worth knowing:

- **It packs a tarball rather than mounting the worktree.** `npm install <dir>` creates a
  symlink, which would make the container resolve dependencies from your host's
  `node_modules` — where the `couchbase` native binding is built for your host platform, not
  for Linux. Packing forces npm to install the right binaries inside the container.
- **`reload` is the only way a code change reaches the container.** The package is a real
  copy inside the volume, so a plain `docker restart` picks up nothing. The same applies to a
  local `~/.n8n/nodes` install: n8n reads nodes at boot, so restart after every rebuild.
- **The n8n version defaults to whatever `test/e2e/docker-compose.yml` pins**, read from that
  file rather than duplicated, so hands-on testing matches what CI runs.
- **The script pins `WEBHOOK_URL`/`N8N_EDITOR_BASE_URL` to the published host port.** n8n
  builds webhook, form and chat URLs from its own base URL rather than from the page you have
  open. Inside the container it listens on 5678, so without those variables it hands the
  browser `http://localhost:5678/...` while the editor is served from `$N8N_PORT` (5679 by
  default). Everything driven by the REST API — including **Execute workflow** — still works,
  because that goes to the current origin; only the Chat panel and copied webhook URLs break,
  with a bare `Error: Failed to receive response` and `TypeError: Failed to fetch` in the
  console and no execution recorded, because the request never reaches n8n. A container
  created before this fix keeps its old environment: `reload` and `docker restart` will not
  pick it up, so run `./test/manual/fresh-n8n.sh up` to recreate it (the volume is kept).

To reach a Couchbase running on your host, use `couchbase://host.docker.internal` — inside
the container `localhost` is n8n itself.

---

## What is actually covered — and what is not

**`Couchbase` node (KV / Query / Search): fully covered.** Every document operation, both
search operations, both search modes, the error paths, and all four resource-locator
dropdowns run against a real cluster inside a real n8n.

**`MemoryCouchbaseChat`: covered, with no model required.** n8n's built-in Chat Memory
Manager node can insert and load messages through any connected memory, so the tests drive
real chat history into Couchbase and read it back — including a check that two sessions
stay isolated. No API key, fully deterministic.

**Vector stores: covered when `OPENAI_API_KEY` is available.** `VectorStoreCouchbaseSearch`
is tested for insert, semantic retrieval, in-place update, ingestion of a document supplied
as **binary** data (exercising `N8nBinaryLoader` rather than the JSON path), and
`retrieve-as-tool` — where a real AI agent has to call the vector store as a tool and come
back with a fact it could not otherwise know. `VectorStoreCouchbaseQuery` is tested for
retrieval over the same documents via SQL++. Without a key the suite **skips them loudly**
(see below) rather than passing quietly.

All five vector-store modes pass: insert, `load`, `update`, `retrieve` (via the Vector
Store QA Tool) and `retrieve-as-tool`, plus binary ingestion and SQL++ vector search.
Finding 7 records one n8n-side incompatibility with the Vector Store *Retriever* node,
which is not the path the UI steers users towards.

The update and binary tests assert against the stored Couchbase document — read back with
the Couchbase node — rather than against a search, so they are not subject to index lag.

Unit-test line coverage is ~7%, which understates things badly: the E2E covers the node
code at runtime, where Jest's instrumentation cannot see it. The paragraphs above are the
meaningful statement, not the percentage.

### Keeping it stable enough to gate a PR

The E2E gates pull requests, so intermittent failures matter. Measured over repeated
back-to-back runs, three distinct causes of flakiness turned up — none of them the AI
tests, which were the ones expected to be unreliable:

| Cause | Symptom | Fix |
| --- | --- | --- |
| Test-data pollution | Each run seeded a near-identical sentence. After a few runs they became each other's nearest neighbours and pushed the current run's document out of `topK`, so retrieval timed out | Vector documents are purged at the start of the vector-store section, and every retrieval query now searches for that run's unique marker |
| Task-broker port collision | `n8n execute` exits 1 with no run data, failing whichever test ran next — several unrelated tests failing at once | Each CLI invocation gets its own random broker port, with one retry |
| Transient connection blips | A single `fetch failed` against the n8n API failed a test outright | Network-level failures retry with backoff; HTTP error *statuses* are not retried, since those are real |

The agent-driven tests turned out to be the *most* reliable part: `retrieve-as-tool`
passed on every valid run, usually on the first attempt. Its variance is vector-index lag,
not the model — the retrieval loop absorbs it, and the timeout is 300s
(`E2E_RETRIEVAL_TIMEOUT_MS`).

Each of the three fixes above was diagnosed from a real observed failure, and the runs
immediately after each fix were clean. A longer soak was attempted but could not be
completed: the development machine ran out of memory and the stack died mid-sequence,
which produced whole-suite failures that say nothing about the tests. **CI is the real
measurement.** If the vector-store section does prove unstable on a runner, the knobs are
the timeouts above, and the fallback is to move just that section to the nightly workflow
while the rest keeps gating pull requests.

### Skips are loud by design

An unverified area must never look like a verified one. When the runner skips something it:

- prints a `⚠ SKIPPED` line inline, and a boxed **NOT VERIFIED BY THIS RUN** summary at the end
- states *why* it skipped and *how to validate it by hand*
- emits a GitHub Actions `::warning::` annotation and a job-summary table, so it is visible
  on the pull request rather than buried in the log

Two things can trigger a skip:

| Skip | When | Consequence |
| --- | --- | --- |
| Vector store nodes | `OPENAI_API_KEY` unset — **always the case on forked pull requests**, where GitHub does not expose repository secrets | Vector store behaviour unverified; validate manually or re-run on a branch |
| Couchbase Query Vector Store | Server has no `APPROX_VECTOR_DISTANCE` (anything before 8.0) | That one node unverified; the rest still runs |
| In-place upgrade to the first deduped release | Node's cached path to the previously bundled `@langchain/core` (finding 8) | The suite restarts n8n and installs cleanly; disappears once that release ships |
| Upgrade from previous release | npmjs unreachable, or no older release exists | Upgrade path unverified; clean install is tested instead |

### Remaining blind spots

| Gap | Risk if it breaks |
| --- | --- |
| Node `typeVersion` 1 vs 2 | Low — `execute()` has no version branching, so both behave identically (verified by inspection) |

## Adding coverage for another node or mode

1. **Find the shape n8n expects.** Bring a stack up with `E2E_KEEP=1 pnpm test:e2e`, then:

   ```bash
   node test/e2e/probe-node.mjs                                   # list this package's nodes
   node test/e2e/probe-node.mjs vectorStoreCouchbase --params     # inputs, outputs, parameters
   ```

   This is the step worth not skipping — most failed attempts come from guessing a
   parameter name or missing a required sub-node input.

2. **Build the workflow JSON.** Main connections plus sub-node connections, remembering
   that an AI sub-node is the *source* of its connection — `subNodeConnection()` handles
   the shape.

3. **Create and execute**: `createAndRunRaw(name, nodes, connections)`, then assert on
   per-node output. Prefer asserting against stored Couchbase state (via the Couchbase
   node) over search results, which are eventually consistent.

4. **Gate it** with `skip()` if it needs something not always present — an API key, a
   minimum server version — so an unverified area is never mistaken for a verified one.

## Findings from building this

These came out of running the suite against the current release; none are fixed here.

1. **The published package fails n8n's verification scan — addressed by `release.yml`.**
   `npx @n8n/scan-community-package n8n-nodes-couchbase@1.3.2` reports
   *"Package was not published with npm provenance"*. Publishing by hand cannot produce
   provenance. The release workflow publishes from CI with npm trusted publishing, which
   attaches provenance automatically, so the next release should clear this — and
   `verify-published.yml` checks it immediately after.

2. **`n8n-workflow` is a `peerDependency`, so npm installs a second copy.** npm 7+
   auto-installs peers, so every community-node install pulls a duplicate `n8n-workflow`
   plus its native `isolated-vm` into `~/.n8n/nodes`. It works, but it is why a plain
   `npm install` of this package fails inside the n8n Docker image (no Python or build
   toolchain for node-gyp). Marking it `optional` in `peerDependenciesMeta` stops npm
   installing it, and n8n supplies it via `NODE_PATH` — verified working, but it was
   reverted along with the LangChain change in finding 7, so it stands unfixed.

3. **SQL++ queries are eventually consistent.** A document written via KV is not
   immediately visible to a `query` operation, because the node issues queries with
   Couchbase's default `not_bounded` scan consistency. The E2E polls to absorb this — it
   failed intermittently before that. Exposing a scan-consistency option on the node would
   remove a real class of user surprise.

4. **`read` returns `value` as a JSON-encoded string** (`JSON.stringify(getResult.content)`),
   while `create`/`upsert` echo back the raw input. Storage itself is correct — documents
   land in Couchbase as objects, which the E2E verified — but the output shape is
   inconsistent across operations. The E2E currently pins the existing behaviour, so
   changing it will surface as a deliberate test update.

5. **"Create Index" fails when the index already exists**, despite using `upsertIndex`.
   The E2E therefore uses a unique index name per run.

6. **The Couchbase Query Vector Store node requires Couchbase Server 8.0 or newer.**
   It builds SQL++ around `APPROX_VECTOR_DISTANCE`. That function does not exist in 7.6.x
   — verified against both 7.6.3 and 7.6.7, which both answer
   *"Invalid function APPROX_VECTOR_DISTANCE"*; 8.0.1 accepts it. On an older server the
   node fails with an opaque `ParsingFailureError: parsing failure` that gives the user no
   hint about the real cause. The E2E therefore defaults to `couchbase:enterprise-8.0.1`
   and skips that one test, with an explanation, on older servers. The node's own README
   already stated the 8.0+ requirement; the top-level README did not mention Couchbase
   versions at all (and omitted the node from its list) — both now fixed.

7. **`retrieve` mode works; the Vector Store *Retriever* node specifically does not.**
   An earlier version of this document claimed `retrieve` mode was broken outright. That
   was wrong, and came from this suite wiring it to the wrong consumer.

   `retrieve` mode supplies an `ai_vectorStore`, and two n8n nodes consume that:

   | Consumer | Works | Why |
   | --- | --- | --- |
   | **Vector Store Question Answer Tool** (`toolVectorStore`) | ✅ | Passes the store straight to `VectorStoreQATool.fromLLM` — no type check |
   | **Vector Store Retriever** (`retrieverVectorStore`) | ❌ | Does `vectorStore instanceof VectorStore` against *n8n's* `@langchain/core` |

   The QA tool is what the n8n UI steers you towards and what real workflows use, so this
   is not a practical blocker — the E2E covers that path and it passes.

   The Retriever path fails because `instanceof` is identity-based: this package bundles
   its own `@langchain/core`, so a store built from it fails a check made against n8n's
   copy, falls into the reranker branch, and dereferences `vectorStore.vectorStore` —
   undefined, surfacing as `Cannot read properties of undefined (reading 'asRetriever')`.

   De-duplicating `@langchain/core` does fix it, and was tried — but it is not viable: on
   n8n 2.39.5 only `@langchain/core` and `n8n-workflow` are exposed to community nodes via
   `NODE_PATH`, while `@langchain/classic` and `@langchain/community` are not. The package
   must bundle those, and both peer-depend on `@langchain/core`, which npm then installs —
   putting the duplicate straight back. That attempt was reverted.

   Since the supported path works, this is worth reporting to n8n rather than working
   around here: duck-typing on `asRetriever` instead of `instanceof` would fix it for every
   community vector store. Until then, a user who wires **Vector Store Retriever** instead
   of the QA tool gets a confusing error.

8. **`latest` is not a reproducible target, and testing against it silently wasted days.**
   The E2E used `docker.n8n.io/n8nio/n8n:latest`. A locally cached `latest` was **n8n
   2.9.4** (months old) while CI pulled **2.39.5** — so local runs and CI were testing
   different software, every local run passed, every CI run failed, and three separate
   "fixes" were made against the wrong version. The compose file now pins the version, the
   nightly run overrides it with `latest` on purpose to catch upstream drift, and
   `run.sh` prints the n8n and Couchbase versions at the start of every run.

9. **The Couchbase node discards query error details.** A failing SQL++ query surfaces as
   `Query failed with error: ParsingFailureError: parsing failure`; the server's actual
   message (*"Invalid function APPROX_VECTOR_DISTANCE"*) is dropped. That made the finding
   above much harder to diagnose than it needed to be, and it will do the same to users.

## Next steps

1. Add a release note for the upgrade restart (finding 8), and consider reporting the
   `instanceof` check (finding 7) upstream — duck-typing on `asRetriever` would fix it for
   every community vector store, not just this one.
2. Document the Couchbase 8.0+ minimum for the Query Vector Store node, and surface the
   server's real error instead of a bare `ParsingFailureError`.
3. Widen `format` and `format:check` to `utils` after a one-off `prettier utils --write`.
4. Publish with npm provenance so `verify-published.yml` passes (tracked separately).
