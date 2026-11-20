import {
	CouchbaseQueryVectorStore,
	CouchbaseQueryVectorStoreArgs,
	DistanceStrategy,
} from '@langchain/community/vectorstores/couchbase_query';
import {
	IExecuteFunctions,
	type INodeProperties,
	ISupplyDataFunctions,
	NodeOperationError,
} from 'n8n-workflow';

import { createVectorStoreNode } from '../shared/createVectorStoreNode/createVectorStoreNode';
import {
	couchbaseVectorStoreInsertFields,
	couchbaseVectorStoreRetrieveFields,
	couchbaseVectorStoreSharedFields,
	getAddVectorOptions,
	getCouchbaseVectorStoreBaseArgs,
} from '../shared/couchbaseVectorStore';
import {
	populateCouchbaseBucketRL,
	populateCouchbaseCollectionRL,
	populateCouchbaseScopeRL,
} from '@utils/couchbase/populateCouchbaseRLs';
import { couchbaseCredentialTest } from '@utils/couchbase/couchbaseCredentialTest';

const distanceStrategyField: INodeProperties = {
	displayName: 'Distance Strategy',
	name: 'distanceStrategy',
	type: 'options',
	default: 'dot',
	description: 'The distance metric used for vector similarity search',
	options: [
		{
			name: 'Dot Product',
			value: 'dot',
			description: 'Dot product similarity (default)',
		},
		{
			name: 'Euclidean',
			value: 'euclidean',
			description: 'Euclidean distance',
		},
		{
			name: 'Euclidean Squared',
			value: 'euclidean_squared',
			description: 'Euclidean distance squared',
		},
		{
			name: 'Cosine',
			value: 'cosine',
			description: 'Cosine similarity',
		},
	],
};

/**
 * Map string value to DistanceStrategy enum
 */
function mapDistanceStrategy(value: string): DistanceStrategy {
	switch (value) {
		case 'dot':
			return DistanceStrategy.DOT;
		case 'cosine':
			return DistanceStrategy.COSINE;
		case 'euclidean':
			return DistanceStrategy.EUCLIDEAN;
		case 'euclidean_squared':
			return DistanceStrategy.EUCLIDEAN_SQUARED;
		default:
			return DistanceStrategy.DOT;
	}
}

/**
 * Build the CouchbaseQueryVectorStore arguments for one item
 */
async function getVectorStoreArgs(
	context: IExecuteFunctions | ISupplyDataFunctions,
	itemIndex: number,
): Promise<CouchbaseQueryVectorStoreArgs> {
	const distanceStrategy = mapDistanceStrategy(
		context.getNodeParameter('distanceStrategy', itemIndex, 'dot') as string,
	);
	return { ...(await getCouchbaseVectorStoreBaseArgs(context, itemIndex)), distanceStrategy };
}

export class VectorStoreCouchbaseQuery extends createVectorStoreNode<CouchbaseQueryVectorStore>({
	meta: {
		displayName: 'Couchbase Query Vector Store',
		name: 'vectorStoreCouchbaseQuery',
		description:
			'Work with your data using the Couchbase Query Vector Store. This node conducts vector retrievals using the Query service with SQL++ vector indexes.',
		icon: {
			light: 'file:../../icons/couchbase.svg',
			dark: 'file:../../icons/couchbase.dark.svg',
		},
		docsUrl:
			'https://github.com/Couchbase-Ecosystem/n8n-nodes-couchbase/blob/master/nodes/vector_store/VectorStoreCouchbaseQuery/README.md',
		credentials: [
			{
				name: 'couchbaseApi',
				required: true,
				testedBy: 'couchbaseCredentialTest',
			},
		],
		operationModes: ['load', 'insert', 'retrieve', 'update', 'retrieve-as-tool'],
	},
	methods: {
		credentialTest: {
			couchbaseCredentialTest,
		},
		listSearch: {
			populateCouchbaseBucketRL,
			populateCouchbaseScopeRL,
			populateCouchbaseCollectionRL,
		},
	},
	retrieveFields: couchbaseVectorStoreRetrieveFields,
	loadFields: couchbaseVectorStoreRetrieveFields,
	insertFields: couchbaseVectorStoreInsertFields,
	sharedFields: couchbaseVectorStoreSharedFields([distanceStrategyField]),
	async getVectorStoreClient(context, _filter, embeddings, itemIndex) {
		try {
			const vectorStoreArgs = await getVectorStoreArgs(context, itemIndex);
			return CouchbaseQueryVectorStore.initialize(embeddings, vectorStoreArgs);
		} catch (error: any) {
			throw new NodeOperationError(context.getNode(), `Error: ${error.message}`);
		}
	},
	async populateVectorStore(context, embeddings, documents, itemIndex) {
		try {
			const vectorStoreArgs = await getVectorStoreArgs(context, itemIndex);
			const addVectorOptions = getAddVectorOptions(context, itemIndex);

			// Initialize the vector store and use addDocuments to get the inserted IDs
			const vectorStore = await CouchbaseQueryVectorStore.initialize(embeddings, vectorStoreArgs);
			return await vectorStore.addDocuments(documents, addVectorOptions);
		} catch (error: any) {
			throw new NodeOperationError(context.getNode(), `Error: ${error.message}`);
		}
	},
}) {}
