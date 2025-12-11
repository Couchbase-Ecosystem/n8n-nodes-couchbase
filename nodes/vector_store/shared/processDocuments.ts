import type { Document } from '@langchain/core/documents';
import type { INodeExecutionData } from 'n8n-workflow';

import { N8nBinaryLoader } from '@utils/N8nBinaryLoader';
import { N8nJsonLoader } from '@utils/N8nJsonLoader';

/**
 * Type guard to check if input is a document loader (N8nJsonLoader or N8nBinaryLoader).
 * Uses multiple checks to handle module resolution issues that can break instanceof.
 */
function isDocumentLoader(
	input: unknown,
): input is N8nJsonLoader | N8nBinaryLoader {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return false;
	}

	// Try instanceof first (works in most cases)
	if (input instanceof N8nJsonLoader || input instanceof N8nBinaryLoader) {
		return true;
	}

	// Fallback: check for the processItem method which is unique to loaders
	// This handles cases where instanceof fails due to module resolution
	if ('processItem' in input && typeof (input as { processItem: unknown }).processItem === 'function') {
		return true;
	}

	return false;
}

export async function processDocument(
	documentInput: N8nJsonLoader | N8nBinaryLoader | Array<Document<Record<string, unknown>>>,
	inputItem: INodeExecutionData,
	itemIndex: number,
) {
	let processedDocuments: Document[];

	// Use type guard for robust loader detection
	if (isDocumentLoader(documentInput)) {
		processedDocuments = await documentInput.processItem(inputItem, itemIndex);
	} else {
		// It's an array of documents
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
