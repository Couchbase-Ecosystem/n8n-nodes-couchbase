export const mockDocument = {
	id: 'doc-001',
	name: 'Test Document',
	value: 100,
	tags: ['test', 'mock'],
};

export const mockDocumentJson = JSON.stringify(mockDocument);

export const mockDocumentWithNestedData = {
	id: 'doc-002',
	user: {
		name: 'John Doe',
		email: 'john@example.com',
	},
	metadata: {
		created: '2024-01-01',
		modified: '2024-01-02',
	},
};

export const mockSearchResults = [
	{ id: 'doc-001', score: 0.95, fields: { name: 'Result 1' } },
	{ id: 'doc-002', score: 0.85, fields: { name: 'Result 2' } },
	{ id: 'doc-003', score: 0.75, fields: { name: 'Result 3' } },
];

export const mockQueryResults = [
	{ id: 'row-001', name: 'Query Result 1', value: 10 },
	{ id: 'row-002', name: 'Query Result 2', value: 20 },
];

export const mockVectorSearchResults = [
	{ pageContent: 'Document content 1', metadata: { source: 'file1.txt' } },
	{ pageContent: 'Document content 2', metadata: { source: 'file2.txt' } },
];
