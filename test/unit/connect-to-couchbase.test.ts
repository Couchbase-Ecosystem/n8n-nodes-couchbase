import { mockExecuteFunctions } from '../helpers/mock-context';

const connectMock = jest.fn();
const closeMock = jest.fn();

jest.mock('couchbase', () => {
	const actual = jest.requireActual('couchbase');
	return {
		...actual,
		connect: (...args: unknown[]) => connectMock(...args),
	};
});

// The module caches the cluster at module scope, so each test needs a fresh copy.
function loadModule() {
	let mod!: typeof import('@utils/couchbase/connectToCouchbase');
	jest.isolateModules(() => {
		mod = require('@utils/couchbase/connectToCouchbase');
	});
	return mod;
}

function makeCluster(tag: string) {
	return { tag, close: closeMock };
}

describe('connectToCouchbase', () => {
	beforeEach(() => {
		connectMock.mockReset();
		closeMock.mockReset();
		closeMock.mockResolvedValue(undefined);
	});

	it('connects using the credentials from the node context', async () => {
		connectMock.mockResolvedValue(makeCluster('a'));
		const { connectToCouchbase } = loadModule();

		const ctx = mockExecuteFunctions();
		const { cluster } = await connectToCouchbase(ctx);

		expect(cluster).toMatchObject({ tag: 'a' });
		expect(connectMock).toHaveBeenCalledTimes(1);
		expect(connectMock).toHaveBeenCalledWith(
			'couchbase://localhost',
			expect.objectContaining({ username: 'Administrator', password: 'password' }),
		);
	});

	it('reuses the cached cluster when credentials are unchanged', async () => {
		connectMock.mockResolvedValue(makeCluster('a'));
		const { connectToCouchbase } = loadModule();

		await connectToCouchbase(mockExecuteFunctions());
		await connectToCouchbase(mockExecuteFunctions());

		expect(connectMock).toHaveBeenCalledTimes(1);
		expect(closeMock).not.toHaveBeenCalled();
	});

	it('closes the old cluster and reconnects when credentials change', async () => {
		connectMock.mockResolvedValueOnce(makeCluster('a')).mockResolvedValueOnce(makeCluster('b'));
		const { connectToCouchbase } = loadModule();

		await connectToCouchbase(mockExecuteFunctions());
		const { cluster } = await connectToCouchbase(
			mockExecuteFunctions({
				credentials: {
					couchbaseConnectionString: 'couchbase://other-host',
					couchbaseUsername: 'Administrator',
					couchbasePassword: 'password',
				},
			}),
		);

		expect(connectMock).toHaveBeenCalledTimes(2);
		expect(closeMock).toHaveBeenCalledTimes(1);
		expect(cluster).toMatchObject({ tag: 'b' });
	});

	it('surfaces connection failures as NodeOperationError', async () => {
		connectMock.mockRejectedValue(new Error('boom'));
		const { connectToCouchbase } = loadModule();

		await expect(connectToCouchbase(mockExecuteFunctions())).rejects.toThrow(
			/Could not connect to database: boom/,
		);
	});

	it('does not cache a failed connection', async () => {
		connectMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(makeCluster('a'));
		const { connectToCouchbase } = loadModule();

		await expect(connectToCouchbase(mockExecuteFunctions())).rejects.toThrow();
		const { cluster } = await connectToCouchbase(mockExecuteFunctions());

		expect(cluster).toMatchObject({ tag: 'a' });
		expect(connectMock).toHaveBeenCalledTimes(2);
	});
});
