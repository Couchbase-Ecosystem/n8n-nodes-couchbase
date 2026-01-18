import type { Embeddings } from '@langchain/core/embeddings';
import type { VectorStore } from '@langchain/core/vectorstores';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { getMetadataFiltersValues, logAiEvent } from '@utils/helpers';

import type { VectorStoreNodeConstructorArgs } from '../types';

/**
 * Handles the 'retrieve-as-tool' operation mode in execute context
 * This is called when the AI Agent invokes the tool during chat interactions
 */
export async function handleRetrieveAsToolExecuteOperation<T extends VectorStore = VectorStore>(
	context: IExecuteFunctions,
	args: VectorStoreNodeConstructorArgs<T>,
	embeddings: Embeddings,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const filter = getMetadataFiltersValues(context, itemIndex);
	const vectorStore = await args.getVectorStoreClient(
		context,
		// We'll pass filter to similaritySearchVectorWithScore instead of getVectorStoreClient
		undefined,
		embeddings,
		itemIndex,
	);

	try {
		// Get the search query from input data - AI Agent passes query via 'input' field
		const inputData = context.getInputData();
		const item = inputData[itemIndex];
		const query = item?.json?.input as string | undefined;

		if (!query || typeof query !== 'string') {
			throw new Error('Input data must contain an "input" field with the search query');
		}

		// Get the search parameters from the node
		const topK = context.getNodeParameter('topK', itemIndex, 4) as number;
		const includeDocumentMetadata = context.getNodeParameter(
			'includeDocumentMetadata',
			itemIndex,
			true,
		) as boolean;

		// Embed the query to prepare for vector similarity search
		const embeddedQuery = await embeddings.embedQuery(query);

		// Get the most similar documents to the embedded query
		const docs = await vectorStore.similaritySearchVectorWithScore(embeddedQuery, topK, filter);

		// Format the documents for the tool output - matching the format expected by AI Agent
		const serializedDocs = docs.map(([doc]) => {
			const content = includeDocumentMetadata ? doc : { pageContent: doc.pageContent };
			return { type: 'text', text: JSON.stringify(content) };
		});

		// Log the AI event for analytics
		logAiEvent(context, 'ai-tool-called', { query });

		return [
			{
				json: {
					response: serializedDocs,
				},
				pairedItem: {
					item: itemIndex,
				},
			},
		];
	} finally {
		// Release the vector store client if a release method was provided
		args.releaseVectorStoreClient?.(vectorStore);
	}
}
