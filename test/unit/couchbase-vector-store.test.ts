jest.mock('@utils/couchbase/connectToCouchbase', () => ({
	connectToCouchbase: jest.fn(),
}));
jest.mock('@utils/couchbase/validateBucketScopeCollection', () => ({
	validateBucketScopeCollection: jest.fn(),
}));

import { connectToCouchbase } from '@utils/couchbase/connectToCouchbase';
import { validateBucketScopeCollection } from '@utils/couchbase/validateBucketScopeCollection';
import type { INodeProperties } from 'n8n-workflow';

import {
	couchbaseVectorStoreSharedFields,
	getAddVectorOptions,
	getCouchbaseVectorStoreBaseArgs,
} from '../../nodes/vector_store/shared/couchbaseVectorStore';
import { mockExecuteFunctions } from '../helpers/mock-context';

const fakeCluster = { fake: 'cluster' };

beforeEach(() => {
	jest
		.mocked(connectToCouchbase)
		.mockReset()
		.mockResolvedValue({ cluster: fakeCluster } as never);
	jest.mocked(validateBucketScopeCollection).mockReset().mockResolvedValue(undefined);
});

describe('couchbaseVectorStoreSharedFields', () => {
	it('places store-specific fields between the collection locator and the field keys', () => {
		const specific = { name: 'distanceStrategy' } as INodeProperties;
		expect(couchbaseVectorStoreSharedFields([specific]).map((f) => f.name)).toEqual([
			'couchbaseBucket',
			'couchbaseScope',
			'couchbaseCollection',
			'distanceStrategy',
			'embedding',
			'textFieldKey',
		]);
	});
});

describe('getCouchbaseVectorStoreBaseArgs', () => {
	it('reads the shared parameters, validates the keyspace and returns the shared store args', async () => {
		const ctx = mockExecuteFunctions({
			params: {
				couchbaseBucket: 'travel-sample',
				couchbaseScope: 'inventory',
				couchbaseCollection: 'hotel',
				embedding: 'vec',
				textFieldKey: 'text',
			},
		});

		await expect(getCouchbaseVectorStoreBaseArgs(ctx, 0)).resolves.toEqual({
			cluster: fakeCluster,
			bucketName: 'travel-sample',
			scopeName: 'inventory',
			collectionName: 'hotel',
			embeddingKey: 'vec',
			textKey: 'text',
		});
		expect(validateBucketScopeCollection).toHaveBeenCalledWith(
			ctx,
			'travel-sample',
			'inventory',
			'hotel',
		);
		for (const name of ['couchbaseBucket', 'couchbaseScope', 'couchbaseCollection']) {
			expect(ctx.getNodeParameter).toHaveBeenCalledWith(name, 0, '', { extractValue: true });
		}
	});

	it('propagates keyspace validation failures', async () => {
		jest.mocked(validateBucketScopeCollection).mockRejectedValue(new Error('no such scope'));
		await expect(getCouchbaseVectorStoreBaseArgs(mockExecuteFunctions(), 0)).rejects.toThrow(
			'no such scope',
		);
	});
});

describe('getAddVectorOptions', () => {
	const withValues = (values?: Record<string, unknown>) =>
		mockExecuteFunctions({ params: { options: { addVectorOptions: { values } } } });

	it('returns undefined when no add-vector options are set', () => {
		expect(getAddVectorOptions(mockExecuteFunctions(), 0)).toBeUndefined();
		expect(getAddVectorOptions(withValues(undefined), 0)).toBeUndefined();
		expect(getAddVectorOptions(withValues({ ids: '', metadata: '' }), 0)).toBeUndefined();
	});

	it('splits and trims comma-separated IDs', () => {
		expect(getAddVectorOptions(withValues({ ids: 'a, b ,c' }), 0)).toEqual({
			ids: ['a', 'b', 'c'],
			metadata: undefined,
		});
	});

	it('parses metadata JSON', () => {
		expect(getAddVectorOptions(withValues({ metadata: '[{"k":1}]' }), 0)).toEqual({
			ids: undefined,
			metadata: [{ k: 1 }],
		});
	});

	it('rejects malformed metadata JSON', () => {
		expect(() => getAddVectorOptions(withValues({ metadata: '[{' }), 0)).toThrow(
			'Invalid metadata JSON format',
		);
	});
});
