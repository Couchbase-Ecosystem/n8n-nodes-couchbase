import { vi } from 'vitest';

// Mock Couchbase error classes
export class CouchbaseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CouchbaseError';
	}
}

export class DocumentExistsError extends CouchbaseError {
	constructor(message = 'Document already exists') {
		super(message);
		this.name = 'DocumentExistsError';
	}
}

export class DocumentNotFoundError extends CouchbaseError {
	constructor(message = 'Document not found') {
		super(message);
		this.name = 'DocumentNotFoundError';
	}
}

export class ParsingFailureError extends CouchbaseError {
	constructor(message = 'Parsing failure') {
		super(message);
		this.name = 'ParsingFailureError';
	}
}

export class TimeoutError extends CouchbaseError {
	constructor(message = 'Operation timed out') {
		super(message);
		this.name = 'TimeoutError';
	}
}

export class TemporaryFailureError extends CouchbaseError {
	constructor(message = 'Temporary failure') {
		super(message);
		this.name = 'TemporaryFailureError';
	}
}

export class UnambiguousTimeoutError extends CouchbaseError {
	constructor(message = 'Unambiguous timeout') {
		super(message);
		this.name = 'UnambiguousTimeoutError';
	}
}

export class AuthenticationFailureError extends CouchbaseError {
	constructor(message = 'Authentication failed') {
		super(message);
		this.name = 'AuthenticationFailureError';
	}
}

export class IndexNotFoundError extends CouchbaseError {
	constructor(message = 'Index not found') {
		super(message);
		this.name = 'IndexNotFoundError';
	}
}

// Mock Collection
export const createMockCollection = () => ({
	insert: vi.fn().mockResolvedValue({ cas: '123' }),
	upsert: vi.fn().mockResolvedValue({ cas: '123' }),
	get: vi.fn().mockResolvedValue({ content: { test: 'data' }, cas: '123' }),
	remove: vi.fn().mockResolvedValue({ cas: '123' }),
});

// Mock Bucket
export const createMockBucket = () => ({
	scope: vi.fn().mockReturnValue({
		collection: vi.fn().mockReturnValue(createMockCollection()),
	}),
});

// Mock Cluster
export const createMockCluster = () => ({
	bucket: vi.fn().mockReturnValue(createMockBucket()),
	query: vi.fn().mockResolvedValue({ rows: [{ id: '1', name: 'test' }] }),
	searchQuery: vi.fn().mockResolvedValue({ rows: [{ id: '1', score: 0.9 }] }),
	searchIndexes: vi.fn().mockReturnValue({
		upsertIndex: vi.fn().mockResolvedValue(undefined),
		getAllIndexes: vi.fn().mockResolvedValue([]),
	}),
	close: vi.fn().mockResolvedValue(undefined),
});

// Mock connect function
export const connect = vi.fn().mockResolvedValue(createMockCluster());

// Mock SearchQuery
export const SearchQuery = {
	match: vi.fn().mockReturnValue({ query: 'match' }),
	matchNone: vi.fn().mockReturnValue({ query: 'none' }),
};

export type Cluster = ReturnType<typeof createMockCluster>;
export type Collection = ReturnType<typeof createMockCollection>;
export type MutationResult = { cas: string };
export type GetResult = { content: unknown; cas: string };
export type QueryResult = { rows: unknown[] };
