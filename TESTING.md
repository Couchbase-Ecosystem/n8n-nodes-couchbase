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
E2E_KEEP=1 pnpm test:e2e            # leave the stack up for debugging
N8N_IMAGE_TAG=1.123.4 pnpm test:e2e # pin the n8n version under test
E2E_SKIP_SEARCH=1 pnpm test:e2e     # skip the full-text search tests
N8N_PORT=15678 VERDACCIO_PORT=14873 pnpm test:e2e  # avoid local port clashes
```

With `E2E_KEEP=1` the driver is re-runnable on its own:
`E2E_N8N_URL=http://127.0.0.1:5678 node test/e2e/run-e2e.mjs`.

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
2. The tarball is published to a throwaway **Verdaccio** registry. Verdaccio is configured
   to proxy npmjs for everything *except* `n8n-nodes-couchbase` — otherwise the E2E would
   silently install the released version instead of the build under test.
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

**Install** — owner setup, package install, node-type registration, editor visibility.

**Function** — create → read → delete round-trip; SQL++ query convergence; upsert
overwrite; a missing document failing the workflow; an invalid collection producing a
*useful* error; full-text index creation, indexing, retrieval, and advanced raw-JSON mode.

**Editor** — all four resource-locator dropdowns (`bucket`, `scope`, `collection`, search
index) through `POST /rest/dynamic-node-parameters/resource-locator-results`, the same
endpoint the editor calls. These matter: if a `listSearch` method breaks, saved workflows
keep running but nobody can configure a new node, so no other layer would notice.

## Layer 5 — Release scan

`@n8n/scan-community-package` is what n8n runs against community nodes before marking them
verified. It inspects the published artefact, so it runs on release, not on PRs.

---

## What is actually covered — and what is not

This is the part to read before trusting a release.

**`Couchbase` node (KV / Query / Search): well covered.** Every document operation, both
search operations, both search modes, the error paths, and all four resource-locator
dropdowns run against a real cluster inside a real n8n. A regression here should fail CI.

**The three AI nodes are smoke-tested only.** `VectorStoreCouchbaseSearch`,
`VectorStoreCouchbaseQuery` and `MemoryCouchbaseChat` are proven to *load*, register with
n8n, and expose a valid description — the package-contract suite instantiates all four
nodes. Nothing exercises their behaviour. That is roughly 1,500 lines of vector-store code
plus the chat-memory history, untested.

Unit-test line coverage is **~7%**, and that number is honest rather than flattering: the
E2E covers `Couchbase.node.ts` at runtime, which Jest's coverage does not see. The
meaningful statement is the two paragraphs above, not the percentage.

Specific blind spots, in rough order of risk:

| Gap | Risk if it breaks | Why it is not covered |
| --- | --- | --- |
| Vector store insert / retrieve / update / retrieve-as-tool | Silent data or search failures for AI users | Needs an embeddings provider in CI — see below |
| Chat memory read/write | Agents lose conversation history | Needs a model + parent chain |
| `logWrapper`, `N8nBinaryLoader`, `N8nJsonLoader`, `fromAIToolFactory` | Vendored n8n helpers used only by the AI nodes | Only reachable through those nodes |
| Node `typeVersion` 1 vs 2 | Low — `execute()` has no version branching, so both behave identically | Verified by inspection, not by test |
| Upgrading from a previously installed version | A broken upgrade path in the n8n UI | The E2E always installs fresh |

### Closing the AI-node gap

The vector store and memory nodes need an embeddings model to test end to end. Two viable
routes, both a real cost trade-off rather than a technical blocker:

- **Ollama in the compose stack** — add an `ollama` service and pull a small embedding
  model (`all-minilm` is ~45 MB). No API key, no spend, fully hermetic; costs image pull
  and CI minutes, so it likely belongs in the nightly run rather than on every PR.
- **A real provider key** (OpenAI or similar) as a CI secret — fast and small, but adds
  spend, secret management, and an external dependency that can flake or rate-limit.

## Findings from building this

These came out of running the suite against the current release; none are fixed here.

1. **The published package fails n8n's verification scan.**
   `npx @n8n/scan-community-package n8n-nodes-couchbase@1.3.2` reports
   *"Package was not published with npm provenance"*. This is a release-process change
   (publish with `--provenance` from CI), not a code change, and it gates verified status.

2. **`n8n-workflow` is a `peerDependency`, so npm installs a second copy.** npm 7+
   auto-installs peers, so every community-node install pulls a duplicate `n8n-workflow`
   plus its native `isolated-vm` into `~/.n8n/nodes`. It works, but it is the direct cause
   of the node-gyp failure above whenever install scripts are not disabled. n8n's own
   starter keeps `n8n-workflow` as a devDependency. The package-contract suite pins that it
   stays out of runtime `dependencies`; moving it out of `peerDependencies` is worth
   considering separately.

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

## Next steps

1. Close the AI-node gap (see above) — this is the one thing standing between "the
   Couchbase node is release-tested" and "the package is release-tested".
2. Widen `format` and `format:check` to `utils` after a one-off `prettier utils --write`.
3. Publish with npm provenance so `verify-published.yml` passes (tracked separately).
