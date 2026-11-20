import {
	CouchbaseSearchVectorStore,
	CouchbaseSearchVectorStoreArgs,
} from '@langchain/community/vectorstores/couchbase_search';
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
	populateCouchbaseSearchIndexesRL,
} from '@utils/couchbase/populateCouchbaseRLs';
import { couchbaseCredentialTest } from '@utils/couchbase/couchbaseCredentialTest';

const useScopedIndex: INodeProperties = {
	displayName: 'Use Scoped Index',
	name: 'useScopedIndex',
	type: 'boolean',
	default: true,
	description: 'Whether to use a scoped search index or a global one',
};

const vectorIndexRL: INodeProperties = {
	displayName: 'Vector Index Name',
	name: 'vectorIndexName',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The name of the vector index',
	typeOptions: {
		loadOptionsDependsOn: [
			'useScopedIndex',
			'couchbaseBucket.value',
			'couchbaseScope.value',
			'couchbaseCollection.value',
		],
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'populateCouchbaseSearchIndexesRL',
			},
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. my_index',
		},
	],
};

/**
 * Build the CouchbaseSearchVectorStore arguments for one item
 */
async function getVectorStoreArgs(
	context: IExecuteFunctions | ISupplyDataFunctions,
	itemIndex: number,
): Promise<CouchbaseSearchVectorStoreArgs> {
	const scopedIndex = context.getNodeParameter('useScopedIndex', itemIndex, '') as boolean;
	const indexName = context.getNodeParameter('vectorIndexName', itemIndex, '', {
		extractValue: true,
	}) as string;
	return { ...(await getCouchbaseVectorStoreBaseArgs(context, itemIndex)), indexName, scopedIndex };
}

export class VectorStoreCouchbaseSearch extends createVectorStoreNode<CouchbaseSearchVectorStore>({
	meta: {
		displayName: 'Couchbase Search Vector Store',
		name: 'vectorStoreCouchbaseSearch',
		description:
			'Work with your data using the Couchbase Search Vector Store. This node conducts vector retrievals using the Search service.',
		icon: {
			light: 'file:../../icons/couchbase.svg',
			dark: 'file:../../icons/couchbase.dark.svg',
		},
		docsUrl:
			'https://github.com/Couchbase-Ecosystem/n8n-nodes-couchbase/blob/master/nodes/vector_store/VectorStoreCouchbaseSearch/README.md',
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
			populateCouchbaseSearchIndexesRL,
		},
	},
	retrieveFields: couchbaseVectorStoreRetrieveFields,
	loadFields: couchbaseVectorStoreRetrieveFields,
	insertFields: couchbaseVectorStoreInsertFields,
	sharedFields: couchbaseVectorStoreSharedFields([useScopedIndex, vectorIndexRL]),
	async getVectorStoreClient(context, _filter, embeddings, itemIndex) {
		try {
			const vectorStoreArgs = await getVectorStoreArgs(context, itemIndex);
			return CouchbaseSearchVectorStore.initialize(embeddings, vectorStoreArgs);
		} catch (error: any) {
			throw new NodeOperationError(context.getNode(), `Error: ${error.message}`);
		}
	},
	async populateVectorStore(context, embeddings, documents, itemIndex) {
		try {
			const vectorStoreArgs = await getVectorStoreArgs(context, itemIndex);
			const addVectorOptions = getAddVectorOptions(context, itemIndex);

			// Initialize the vector store and use addDocuments to get the inserted IDs
			const vectorStore = await CouchbaseSearchVectorStore.initialize(embeddings, vectorStoreArgs);
			return await vectorStore.addDocuments(documents, addVectorOptions);
		} catch (error: any) {
			throw new NodeOperationError(context.getNode(), `Error: ${error.message}`);
		}
	},
}) {}
