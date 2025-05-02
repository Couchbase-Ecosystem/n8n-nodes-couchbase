import {
	CouchbaseVectorStore,
	CouchbaseVectorStoreArgs,
} from '@langchain/community/vectorstores/couchbase';
import {
	IDataObject,
	IExecuteFunctions,
	type INodeProperties,
	ISupplyDataFunctions,
	NodeOperationError,
} from 'n8n-workflow';

import { metadataFilterField } from '@utils/sharedFields';

import { createVectorStoreNode } from '../shared/createVectorStoreNode/createVectorStoreNode';
import {
	populateCouchbaseBucketRL,
	populateCouchbaseCollectionRL,
	populateCouchbaseScopeRL,
	populateCouchbaseSearchIndexesRL,
} from '@utils/couchbase/populateCouchbaseRLs';
import { connectToCouchbase } from '@utils/couchbase/connectToCouchbase';
import { validateBucketScopeCollection } from '@utils/couchbase/validateBucketScopeCollection';

const couchbaseBucketRL: INodeProperties = {
	displayName: 'Couchbase Bucket',
	name: 'couchbaseBucket',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'populateCouchbaseBucketRL',
			},
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. my_bucket',
		},
	],
};

const couchbaseScopeRL: INodeProperties = {
	displayName: 'Couchbase Scope',
	name: 'couchbaseScope',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	typeOptions: {
		loadOptionsDependsOn: ['couchbaseBucket.value'],
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'populateCouchbaseScopeRL',
			},
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. my_scope',
		},
	],
};

const couchbaseCollectionRL: INodeProperties = {
	displayName: 'Couchbase Collection',
	name: 'couchbaseCollection',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	typeOptions: {
		loadOptionsDependsOn: ['couchbaseBucket.value', 'couchbaseScope.value'],
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'populateCouchbaseCollectionRL',
			},
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. my_collection',
		},
	],
};

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

const embeddingField: INodeProperties = {
	displayName: 'Embedding Field Key',
	name: 'embedding',
	type: 'string',
	placeholder: 'e.g. embedding',
	default: '',
	description: 'The field with the embedding array',
	required: true,
};

const textField: INodeProperties = {
	displayName: 'Text Field Key',
	name: 'textFieldKey',
	type: 'string',
	placeholder: 'e.g. description',
	default: '',
	description: 'The field with the raw (text) data',
	required: true,
};

const sharedFields: INodeProperties[] = [
	couchbaseBucketRL,
	couchbaseScopeRL,
	couchbaseCollectionRL,
	useScopedIndex,
	vectorIndexRL,
	embeddingField,
	textField,
];

const retrieveFields: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [metadataFilterField],
	},
];

const insertFields: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [
			{
				displayName: 'Add Vector Options',
				name: 'addVectorOptions',
				type: 'fixedCollection',
				default: {},
				description: 'Options for adding vectors with specific ID and metadata',
				options: [
					{
						name: 'values',
						displayName: 'Values',
						values: [
							{
								displayName: 'IDs',
								name: 'ids',
								type: 'string',
								default: '',
								description: 'Comma-separated list of IDs for the vectors',
								placeholder: 'id1,id2,id3',
							},
							{
								displayName: 'Metadata',
								name: 'metadata',
								type: 'json',
								validateType: 'array',
								default: '',
								description: 'Array of metadata objects to attach to the vectors',
							},
						],
					},
				],
			},
		],
	},
];

function getCommonNodeParameters(
	context: IExecuteFunctions | ISupplyDataFunctions,
	itemIndex: number,
) {
	const couchbaseBucketName = context.getNodeParameter('couchbaseBucket', itemIndex, '', {
		extractValue: true,
	}) as string;

	const couchbaseScopeName = context.getNodeParameter('couchbaseScope', itemIndex, '', {
		extractValue: true,
	}) as string;

	const couchbaseCollectionName = context.getNodeParameter('couchbaseCollection', itemIndex, '', {
		extractValue: true,
	}) as string;

	const isUseScopedIndex = context.getNodeParameter('useScopedIndex', itemIndex, '') as boolean;

	const couchbaseVectorIndexName = context.getNodeParameter('vectorIndexName', itemIndex, '', {
		extractValue: true,
	}) as string;

	const embeddingFieldName = context.getNodeParameter('embedding', itemIndex, '', {
		extractValue: true,
	}) as string;

	const textFieldName = context.getNodeParameter('textFieldKey', itemIndex, '', {
		extractValue: true,
	}) as string;
	return {
		couchbaseBucketName,
		couchbaseScopeName,
		couchbaseCollectionName,
		isUseScopedIndex,
		couchbaseVectorIndexName,
		embeddingFieldName,
		textFieldName,
	};
}

export class VectorStoreCouchbaseSearch extends createVectorStoreNode<CouchbaseVectorStore>({
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
			},
		],
		operationModes: ['load', 'insert', 'retrieve', 'update', 'retrieve-as-tool'],
	},
	methods: {
		listSearch: {
			populateCouchbaseBucketRL,
			populateCouchbaseScopeRL,
			populateCouchbaseCollectionRL,
			populateCouchbaseSearchIndexesRL,
		},
	},
	retrieveFields,
	loadFields: retrieveFields,
	insertFields,
	sharedFields,
	async getVectorStoreClient(context, _filter, embeddings, itemIndex) {
		try {
			const {
				couchbaseBucketName,
				couchbaseScopeName,
				couchbaseCollectionName,
				isUseScopedIndex,
				couchbaseVectorIndexName,
				embeddingFieldName,
				textFieldName,
			} = getCommonNodeParameters(context, itemIndex);
			const { cluster } = await connectToCouchbase(context);

			await validateBucketScopeCollection(
				context,
				couchbaseBucketName,
				couchbaseScopeName,
				couchbaseCollectionName,
			);

			const couchbaseConfig: CouchbaseVectorStoreArgs = {
				cluster,
				bucketName: couchbaseBucketName,
				scopeName: couchbaseScopeName,
				collectionName: couchbaseCollectionName,
				indexName: couchbaseVectorIndexName,
				textKey: textFieldName,
				embeddingKey: embeddingFieldName,
				scopedIndex: isUseScopedIndex,
			};

			return CouchbaseVectorStore.initialize(embeddings, couchbaseConfig);
		} catch (error) {
			if (!(error instanceof NodeOperationError)) {
				throw new NodeOperationError(context.getNode(), `Error: ${error.message}`);
			}
			throw error;
		}
	},
	async populateVectorStore(context, embeddings, documents, itemIndex) {
		try {
			const {
				couchbaseBucketName,
				couchbaseScopeName,
				couchbaseCollectionName,
				isUseScopedIndex,
				couchbaseVectorIndexName,
				embeddingFieldName,
				textFieldName,
			} = getCommonNodeParameters(context, itemIndex);
			const { cluster } = await connectToCouchbase(context);

			await validateBucketScopeCollection(
				context,
				couchbaseBucketName,
				couchbaseScopeName,
				couchbaseCollectionName,
			);

			const couchbaseConfig: CouchbaseVectorStoreArgs = {
				cluster,
				bucketName: couchbaseBucketName,
				scopeName: couchbaseScopeName,
				collectionName: couchbaseCollectionName,
				indexName: couchbaseVectorIndexName,
				textKey: textFieldName,
				embeddingKey: embeddingFieldName,
				scopedIndex: isUseScopedIndex,
			};

			const options = context.getNodeParameter('options', itemIndex, {}) as IDataObject;
			if (options.addVectorOptions) {
				const vectorOptions = (options.addVectorOptions as IDataObject).values as IDataObject;

				if (vectorOptions) {
					// Parse the IDs from comma-separated string
					const idsString = vectorOptions.ids as string;
					const ids = idsString ? idsString.split(',').map((id) => id.trim()) : undefined;

					// Parse the metadata JSON string
					let metadata;
					try {
						const metadataString = vectorOptions.metadata as string;
						metadata = metadataString ? JSON.parse(metadataString) : undefined;
					} catch (error) {
						throw new NodeOperationError(context.getNode(), 'Invalid metadata JSON format');
					}

					// Add the vector options to the config
					if (ids || metadata) {
						couchbaseConfig.addVectorOptions = {
							ids,
							metadata,
						};
					}
				}
			}

			await CouchbaseVectorStore.fromDocuments(documents, embeddings, couchbaseConfig);
		} catch (error) {
			if (!(error instanceof NodeOperationError)) {
				throw new NodeOperationError(context.getNode(), `Error: ${error.message}`);
			}
			throw error;
		}
	},
}) {}
