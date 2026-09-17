import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ICredentialType, INodeType, INodeTypeDescription } from 'n8n-workflow';

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** The exact file list `npm publish` would ship, without writing a tarball. */
function packedFiles(): string[] {
	const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
	const parsed = JSON.parse(out);
	return parsed[0].files.map((f: { path: string }) => f.path.replace(/\\/g, '/'));
}

const manifestEntries: string[] = [...pkg.n8n.nodes, ...pkg.n8n.credentials];

beforeAll(() => {
	if (!existsSync(path.join(ROOT, 'dist'))) {
		throw new Error('dist/ is missing — run `pnpm build` before the package-contract tests.');
	}
});

describe('n8n community package manifest', () => {
	it('declares the community node keyword n8n requires for discovery', () => {
		expect(pkg.keywords).toContain('n8n-community-node-package');
	});

	it('pins the n8n nodes API version', () => {
		expect(pkg.n8n.n8nNodesApiVersion).toBe(1);
	});

	it('declares at least one node and the credential it authenticates with', () => {
		expect(pkg.n8n.nodes.length).toBeGreaterThan(0);
		expect(pkg.n8n.credentials.length).toBeGreaterThan(0);
	});

	it('keeps n8n-workflow out of runtime dependencies', () => {
		// n8n supplies n8n-workflow at runtime. Listing it as a real dependency makes npm
		// install a second copy (and its native isolated-vm) into ~/.n8n/nodes.
		expect(Object.keys(pkg.dependencies ?? {})).not.toContain('n8n-workflow');
	});
});

describe('published tarball', () => {
	let files: string[];
	beforeAll(() => {
		files = packedFiles();
	});

	it.each(manifestEntries)('ships the file declared in package.json#n8n: %s', (entry) => {
		expect(files).toContain(entry);
	});

	it('ships every icon referenced by a node or credential', () => {
		const iconFiles = files.filter((f) => f.endsWith('.svg') || f.endsWith('.png'));
		expect(iconFiles.length).toBeGreaterThan(0);
		for (const icon of iconFiles) {
			expect(existsSync(path.join(ROOT, icon))).toBe(true);
		}
	});

	it('does not ship TypeScript sources', () => {
		expect(files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))).toEqual([]);
	});
});

type Loaded = { entry: string; instance: INodeType; description: INodeTypeDescription };

function instantiate<T>(entry: string): T {
	const mod = require(path.join(ROOT, entry));
	const ExportedClass = Object.values(mod).find(
		(v): v is new () => T => typeof v === 'function',
	);
	if (!ExportedClass) throw new Error(`${entry} exports no class`);
	return new ExportedClass();
}

// Loaded eagerly so each node gets its own named test case.
const loadedNodes: Loaded[] = existsSync(path.join(ROOT, 'dist'))
	? pkg.n8n.nodes.map((entry: string) => {
			const instance = instantiate<INodeType>(entry);
			return { entry, instance, description: instance.description };
		})
	: [];

const shippedCredentialNames: string[] = existsSync(path.join(ROOT, 'dist'))
	? pkg.n8n.credentials.map((entry: string) => instantiate<ICredentialType>(entry).name)
	: [];

describe('compiled node types', () => {
	it('loads every node declared in package.json#n8n', () => {
		expect(loadedNodes.map((l) => l.entry)).toEqual(pkg.n8n.nodes);
	});

	it('uses unique node names', () => {
		const names = loadedNodes.map((l) => l.description.name);
		expect(new Set(names).size).toBe(names.length);
	});

	describe.each(loadedNodes.map((l) => [l.entry, l] as const))('%s', (_entry, loaded) => {
		const { description } = loaded;

		it('has the fields n8n needs to render it', () => {
			expect(description.name).toBeTruthy();
			expect(description.displayName).toBeTruthy();
			expect(description.description).toBeTruthy();
			expect(description.defaults?.name).toBeTruthy();
			expect(description.version).toBeDefined();
			expect(Array.isArray(description.properties)).toBe(true);
		});

		it('only requires credentials this package ships', () => {
			for (const cred of description.credentials ?? []) {
				expect(shippedCredentialNames).toContain(cred.name);
			}
		});

		it('resolves its icons to real files on disk', () => {
			const icon = description.icon;
			if (!icon) return;
			const refs = typeof icon === 'string' ? [icon] : Object.values(icon);
			for (const ref of refs) {
				if (typeof ref !== 'string' || !ref.startsWith('file:')) continue;
				const resolved = path.resolve(path.dirname(path.join(ROOT, loaded.entry)), ref.slice(5));
				expect({ ref, exists: existsSync(resolved) }).toEqual({ ref, exists: true });
			}
		});
	});
});

describe('compiled credentials', () => {
	it.each((pkg.n8n.credentials as string[]).map((e) => [e] as const))(
		'%s exposes a usable credential type',
		(entry) => {
			const instance = instantiate<ICredentialType>(entry);
			expect(instance.name).toBeTruthy();
			expect(instance.displayName).toBeTruthy();
			expect(Array.isArray(instance.properties)).toBe(true);
		},
	);
});
