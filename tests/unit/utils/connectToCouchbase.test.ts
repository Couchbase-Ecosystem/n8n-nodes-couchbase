import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCouchbaseCredentials } from '../../fixtures/mockCredentials';
import * as couchbaseMock from '../../__mocks__/couchbase';

// Mock the couchbase module
vi.mock('couchbase', () => couchbaseMock);

describe('connectToCouchbase', () => {
	const mockContext = {
		getCredentials: vi.fn().mockResolvedValue(mockCouchbaseCredentials),
		getNode: vi.fn().mockReturnValue({ name: 'Couchbase' }),
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset the mock connect function
		couchbaseMock.connect.mockClear();
		couchbaseMock.connect.mockResolvedValue(couchbaseMock.createMockCluster());
	});

	describe('connection establishment', () => {
		it('should call connect with correct parameters', async () => {
			const { connectToCouchbase, closeConnection } = await import('@utils/couchbase/connectToCouchbase');

			// Close any existing connection first
			await closeConnection();

			const result = await connectToCouchbase(mockContext as any);

			expect(result.cluster).toBeDefined();
			expect(couchbaseMock.connect).toHaveBeenCalledWith(
				mockCouchbaseCredentials.couchbaseConnectionString,
				expect.objectContaining({
					username: mockCouchbaseCredentials.couchbaseUsername,
					password: mockCouchbaseCredentials.couchbasePassword,
				}),
			);
		});
	});

	describe('error handling', () => {
		it('should throw error on connection failure', async () => {
			const { connectToCouchbase, closeConnection } = await import('@utils/couchbase/connectToCouchbase');

			// Close existing connection
			await closeConnection();

			// Make connect fail
			couchbaseMock.connect.mockRejectedValueOnce(new Error('Connection refused'));

			await expect(connectToCouchbase(mockContext as any)).rejects.toThrow(
				'Could not connect to database',
			);
		});
	});
});
