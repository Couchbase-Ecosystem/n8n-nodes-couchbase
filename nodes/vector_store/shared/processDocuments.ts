import type { Document } from '@langchain/core/documents';
import type { INodeExecutionData } from 'n8n-workflow';

import { N8nBinaryLoader } from '@utils/N8nBinaryLoader';
import { N8nJsonLoader } from '@utils/N8nJsonLoader';

export async function processDocument(
	documentInput: N8nJsonLoader | N8nBinaryLoader | Array<Document<Record<string, unknown>>>,
	inputItem: INodeExecutionData,
	itemIndex: number,
) {
	let processedDocuments: Document[];

	// Use constructor.name as a workaround because instanceof fails due to module resolution issues.
	// Check if documentInput is a non-array object and its constructor name matches.
	if (
		documentInput &&
		typeof documentInput === 'object' &&
		!Array.isArray(documentInput) && // Explicitly check it's not the array type
		(documentInput.constructor?.name === 'N8nJsonLoader' ||
			documentInput.constructor?.name === 'N8nBinaryLoader')
	) {
		// It's identified as a loader based on constructor name
		// Cast needed because TS can't infer type from constructor.name check
		processedDocuments = await (documentInput as N8nJsonLoader | N8nBinaryLoader).processItem(
			inputItem,
			itemIndex,
		);
	} else {
		// Assume it's the array of documents if not identified as a loader
		// Add type assertion for clarity, assuming the input type contract holds
		processedDocuments = documentInput as Array<Document<Record<string, unknown>>>;
	}

	const serializedDocuments = processedDocuments.map(({ metadata, pageContent }) => ({
		json: { metadata, pageContent },
		pairedItem: {
			item: itemIndex,
		},
	}));

	return {
		processedDocuments,
		serializedDocuments,
	};
}
