# Contributing Guide

This document provides instructions for setting up the development environment to contribute to this project.

## Development Environment Setup

The setup process involves using both npm and pnpm package managers. Follow these steps carefully to set up your environment correctly:

### Prerequisites

- Node.js 22.16 or later (Node.js 24 is recommended when validating against current n8n releases)
- npm (comes with Node.js)
- pnpm via Corepack. This repository declares its package-manager version in
  `package.json` (`pnpm@9.1.4` at the time of writing), so Corepack will use the
  project-pinned version automatically.

### Installing pnpm with Corepack

We recommend enabling Node.js corepack:

```bash
corepack enable
```

With Node.js 22.16 or newer, you can enable Corepack and let it install the
project-pinned pnpm version:

```bash
corepack install
```

**IMPORTANT**: If you have installed Node.js via homebrew, you'll need to run:

```bash
brew install corepack
```

This is necessary because homebrew explicitly removes npm and corepack from the node formula.

### Step-by-Step Setup

1. Install n8n globally using npm:
	 ```bash
	 npm install -g n8n
	 ```

2. Run n8n once to generate the necessary configuration directory:
	 ```bash
	 n8n
	 ```
	 This will create a `.n8n` directory in your home folder.

3. Navigate to the n8n configuration directory:
	 ```bash
	 cd ~/.n8n
	 ```

4. Create a custom directory for your custom nodes:
	 ```bash
	 mkdir custom
	 ```

5. Navigate to the custom directory and initialize a new pnpm project:
	 ```bash
	 cd custom
	 pnpm init
	 ```

6. Replace the content of the `package.json` file with the following (be sure to adjust the path to the `n8n-nodes-couchbase` package):
	 ```json
	 {
		 "name": "custom",
		 "version": "1.0.0",
		 "description": "",
		 "main": "index.js",
		 "dependencies": {
			 "@langchain/community": "^0.3.38",
			 "n8n-nodes-couchbase": "file:/path/to/n8n-nodes-couchbase"
		 },
		 "scripts": {
			 "test": "echo \"Error: no test specified\" && exit 1"
		 },
		 "keywords": [],
		 "author": "",
		 "license": "ISC",
		 "packageManager": "pnpm@10.5.0"
	 }
	 ```

	 > **Note:** You may need to update the path to the `n8n-nodes-couchbase` package to match your local environment.

7. Install the dependencies:
	 ```bash
	 pnpm install
	 ```

8. Start the development UI:
	 ```bash
	 pnpm run dev:ui
	 ```

## Running the tests

See [TESTING.md](TESTING.md) for the full strategy. The short version:

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm build      # required before the package-contract and E2E tests
pnpm test       # unit + package-contract tests (fast, no Docker)
pnpm test:e2e   # installs into a real n8n and runs workflows (needs Docker)
```

Scripts follow a `verb:variant` naming convention (`lint`, `lint:fix`, `format:check`,
`test:unit`). The two exceptions are npm's own lifecycle hooks, `preinstall` and
`prepublishOnly`, whose names npm defines.

The E2E vector-store tests need an embeddings model. Copy `test/e2e/.env.example` to
`test/e2e/.env` and add an `OPENAI_API_KEY`; without one those tests are skipped with a
warning rather than failing.

CI runs the fast checks on every pull request and the E2E suite on pull requests,
pushes to `master`, and nightly.

To try the local build by hand in a real n8n UI, `./test/manual/fresh-n8n.sh up` starts a
clean n8n in Docker with the package installed, on <http://localhost:5679>. Use
`reload` after a code change — see
[Manual testing](TESTING.md#manual-testing-testmanual).

## Releasing

Releases are published by CI when a version tag is pushed. Authentication uses npm
**trusted publishing** (OIDC), so there is no npm token in the repository, and npm attaches
provenance automatically — which is what n8n's community-node verification scan requires.

1. Open a PR that bumps `version` in `package.json` (the existing `vX.Y.Z Release` habit).
2. Merge it to `master`.
3. Tag the merge commit and push the tag:

   ```bash
   git tag v1.3.3
   git push origin v1.3.3
   ```

`.github/workflows/release.yml` then refuses to continue unless the tag matches
`package.json`, the version is not already on npm, and `repository.url` matches this
repository. It runs the full CI gate and the complete E2E suite before publishing, creates
the GitHub release with generated notes, and `verify-published.yml` runs n8n's scanner
against the published package afterwards.

A version containing a `-` (for example `v1.4.0-rc.1`) is published under the `next`
dist-tag instead of `latest`, so a prerelease never becomes the default install.

To rehearse without publishing, run the workflow manually from the Actions tab with
**Dry run** left enabled — it does everything up to and including `npm publish --dry-run`.

### Release notes

`.github/workflows/draft-release.yml` keeps a **draft** GitHub release for the next version
up to date on every merge to `master`, so there is always a live view of what the next
release contains. Notes are generated by GitHub from merged pull requests and grouped by
the categories in `.github/release.yml` — label PRs (`feature`, `bug`, `testing`,
`documentation`, …) to place them, or leave them unlabelled and they land under
*Other changes*. Add `skip-changelog` to leave a PR out entirely.

Between releases the draft is named after the next patch version as a placeholder; once the
version-bump PR merges it takes the real version's name.

The draft is **regenerated on every merge**, so hand-edits are overwritten by the next one.
Edit the wording once `master` is quiet before tagging, or edit the published release
afterwards. When you tag, `release.yml` publishes whatever draft exists for that tag rather
than regenerating it, so edits made just before release survive. If no draft exists it
generates the notes at that point instead.

### One-time setup

On npmjs.com, add a trusted publisher for `n8n-nodes-couchbase` pointing at this
repository and `.github/workflows/release.yml`, with direct publishing enabled
(configurations created from September 2026 default to staged publishing). If you scope it
to a deployment environment, use `release`, which is the environment the publish job runs
in.

## Troubleshooting

If you encounter any issues during setup:

- Make sure your Node.js version is compatible with n8n
- Verify that both npm and pnpm are correctly installed
- Check that the path to the n8n-nodes-couchbase package in the package.json file is correct for your environment

## Additional Information

- For more details on working with custom nodes in n8n, refer to the [n8n documentation](https://docs.n8n.io/integrations/creating-nodes/code/).
- If you're encountering persistent issues, please open an issue in the repository.

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
