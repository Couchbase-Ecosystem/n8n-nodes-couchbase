# Contributing Guide

This document provides instructions for setting up the development environment to contribute to this project.

## Development Environment Setup

The setup process involves using both npm and pnpm package managers. Follow these steps carefully to set up your environment correctly:

### Prerequisites

- Node.js (recommended version: 16.x or later)
- npm (comes with Node.js)
- pnpm (version 10.5.0 or compatible)

### Installing pnpm with Corepack

We recommend enabling Node.js corepack:

```bash
corepack enable
```

With Node.js v16.17 or newer, you can install the latest version of pnpm:

```bash
corepack prepare pnpm@latest --activate
```

If you use an older version of Node.js, install at least version 9.15 of pnpm:

```bash
corepack prepare pnpm@9.15.5 --activate
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
