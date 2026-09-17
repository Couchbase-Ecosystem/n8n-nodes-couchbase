import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INode,
	ISupplyDataFunctions,
} from 'n8n-workflow';
import { mock } from 'jest-mock-extended';

export const TEST_NODE: INode = {
	id: 'test-node-id',
	name: 'Couchbase',
	type: 'n8n-nodes-couchbase.couchbase',
	typeVersion: 2,
	position: [0, 0],
	parameters: {},
};

export const TEST_CREDENTIALS = {
	couchbaseConnectionString: 'couchbase://localhost',
	couchbaseUsername: 'Administrator',
	couchbasePassword: 'password',
};

type ContextOverrides = {
	params?: Record<string, unknown>;
	credentials?: Record<string, unknown>;
};

/**
 * Builds a mocked n8n execution context. `getNodeParameter` reads from `params`,
 * falling back to the default the node passes in — matching n8n's real behaviour.
 */
export function mockExecuteFunctions(overrides: ContextOverrides = {}) {
	const params = overrides.params ?? {};
	const credentials = overrides.credentials ?? TEST_CREDENTIALS;

	const ctx = mock<IExecuteFunctions>();

	ctx.getNode.mockReturnValue(TEST_NODE);
	ctx.getCredentials.mockResolvedValue(credentials as never);
	ctx.getNodeParameter.mockImplementation((name: string, _idx: unknown, fallback?: unknown) => {
		return (name in params ? params[name] : fallback) as never;
	});

	// n8n injects a logger onto every context; the nodes call it during connection setup.
	(ctx as unknown as { logger: unknown }).logger = {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	};

	return ctx;
}

export function mockLoadOptionsFunctions(overrides: ContextOverrides = {}) {
	return mockExecuteFunctions(overrides) as unknown as ILoadOptionsFunctions;
}

export function mockSupplyDataFunctions(overrides: ContextOverrides = {}) {
	return mockExecuteFunctions(overrides) as unknown as ISupplyDataFunctions;
}
