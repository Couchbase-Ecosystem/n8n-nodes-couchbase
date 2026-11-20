import type { Cluster } from 'couchbase';
import {
	IDataObject,
	IExecuteFunctions,
	type INodeProperties,
	ISupplyDataFunctions,
	NodeOperationError,
} from 'n8n-workflow';

import { metadataFilterField } from '@utils/sharedFields';
import { connectToCouchbase } from '@utils/couchbase/connectToCouchbase';
import { validateBucketScopeCollection } from '@utils/couchbase/validateBucketScopeCollection';

/**
 * Everything the Couchbase Query and Search vector-store nodes have in common:
 * the bucket/scope/collection/field-key parameters, the insert/retrieve option
 * collections, and the connect-validate-build sequence that turns those parameters
 * into the arguments both LangChain stores share. Each node adds only its
 * store-specific fields and arguments on top.
 */

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

/**
 * Builds a node's `sharedFields`: bucket/scope/collection locators, then the
 * store-specific fields, then the embedding/text field keys. The order is what
 * users see in the node panel, so it is fixed here rather than in each node.
 */
export function couchbaseVectorStoreSharedFields(
	storeSpecificFields: INodeProperties[],
): INodeProperties[] {
	return [
		couchbaseBucketRL,
		couchbaseScopeRL,
		couchbaseCollectionRL,
		...storeSpecificFields,
		embeddingField,
		textField,
	];
}

export const couchbaseVectorStoreRetrieveFields: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [metadataFilterField],
	},
];

export const couchbaseVectorStoreInsertFields: INodeProperties[] = [
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

/** The arguments CouchbaseQueryVectorStoreArgs and CouchbaseSearchVectorStoreArgs share. */
export type CouchbaseVectorStoreBaseArgs = {
	cluster: Cluster;
	bucketName: string;
	scopeName: string;
	collectionName: string;
	textKey: string;
	embeddingKey: string;
};

/**
 * Reads the shared parameters, connects, and checks the bucket/scope/collection
 * exist, returning the arguments common to both Couchbase vector stores.
 */
export async function getCouchbaseVectorStoreBaseArgs(
	context: IExecuteFunctions | ISupplyDataFunctions,
	itemIndex: number,
): Promise<CouchbaseVectorStoreBaseArgs> {
	const bucketName = context.getNodeParameter('couchbaseBucket', itemIndex, '', {
		extractValue: true,
	}) as string;
	const scopeName = context.getNodeParameter('couchbaseScope', itemIndex, '', {
		extractValue: true,
	}) as string;
	const collectionName = context.getNodeParameter('couchbaseCollection', itemIndex, '', {
		extractValue: true,
	}) as string;
	const embeddingKey = context.getNodeParameter('embedding', itemIndex, '', {
		extractValue: true,
	}) as string;
	const textKey = context.getNodeParameter('textFieldKey', itemIndex, '', {
		extractValue: true,
	}) as string;

	const { cluster } = await connectToCouchbase(context);
	await validateBucketScopeCollection(context, bucketName, scopeName, collectionName);

	return { cluster, bucketName, scopeName, collectionName, textKey, embeddingKey };
}

export type AddVectorOptions = { ids?: string[]; metadata?: Record<string, unknown>[] };

/**
 * Parses the insert-mode "Add Vector Options" collection into the options
 * `addDocuments` accepts. Returns undefined when neither IDs nor metadata are set.
 */
export function getAddVectorOptions(
	context: IExecuteFunctions | ISupplyDataFunctions,
	itemIndex: number,
): AddVectorOptions | undefined {
	const options = context.getNodeParameter('options', itemIndex, {}) as IDataObject;
	if (!options.addVectorOptions) return undefined;

	const vectorOptions = (options.addVectorOptions as IDataObject).values as IDataObject;
	if (!vectorOptions) return undefined;

	const idsString = vectorOptions.ids as string;
	const ids = idsString ? idsString.split(',').map((id) => id.trim()) : undefined;

	let metadata;
	try {
		const metadataString = vectorOptions.metadata as string;
		metadata = metadataString ? JSON.parse(metadataString) : undefined;
	} catch (error) {
		throw new NodeOperationError(context.getNode(), 'Invalid metadata JSON format');
	}

	return ids || metadata ? { ids, metadata } : undefined;
}
