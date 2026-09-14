import { mockExecuteFunctions } from '../helpers/mock-context';

const getAllScopes = jest.fn();

jest.mock('@utils/couchbase/connectToCouchbase', () => ({
	connectToCouchbase: jest.fn().mockImplementation(async () => ({
		cluster: {
			bucket: () => ({ collections: () => ({ getAllScopes }) }),
		},
	})),
}));

import { validateBucketScopeCollection } from '@utils/couchbase/validateBucketScopeCollection';

describe('validateBucketScopeCollection', () => {
	beforeEach(() => {
		getAllScopes.mockReset();
		getAllScopes.mockResolvedValue([
			{ name: 'inventory', collections: [{ name: 'hotel' }, { name: 'airline' }] },
		]);
	});

	it.each([
		['bucket', '', 'inventory', 'hotel', 'Bucket name is required'],
		['scope', 'travel', '', 'hotel', 'Scope name is required'],
		['collection', 'travel', 'inventory', '', 'Collection name is required'],
	])('rejects a missing %s', async (_label, bucket, scope, collection, message) => {
		await expect(
			validateBucketScopeCollection(mockExecuteFunctions(), bucket, scope, collection),
		).rejects.toThrow(message);
	});

	it('passes when bucket, scope and collection all exist', async () => {
		await expect(
			validateBucketScopeCollection(mockExecuteFunctions(), 'travel', 'inventory', 'hotel'),
		).resolves.toBeUndefined();
	});

	it('rejects a scope that is not in the bucket', async () => {
		await expect(
			validateBucketScopeCollection(mockExecuteFunctions(), 'travel', 'nope', 'hotel'),
		).rejects.toThrow('Scope "nope" not found in bucket "travel"');
	});

	it('rejects a collection that is not in the scope', async () => {
		await expect(
			validateBucketScopeCollection(mockExecuteFunctions(), 'travel', 'inventory', 'nope'),
		).rejects.toThrow('Collection "nope" not found in scope "inventory"');
	});

	it('wraps unexpected SDK errors as NodeOperationError', async () => {
		getAllScopes.mockRejectedValue(new Error('cluster unreachable'));
		await expect(
			validateBucketScopeCollection(mockExecuteFunctions(), 'travel', 'inventory', 'hotel'),
		).rejects.toThrow('Error: cluster unreachable');
	});
});
