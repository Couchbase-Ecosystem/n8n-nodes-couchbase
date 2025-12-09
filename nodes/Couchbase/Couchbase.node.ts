import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeParameterResourceLocator,
	INodeType,
	INodeTypeDescription,
	IPairedItemData,
	NodeOperationError,
} from 'n8n-workflow';

import {
	Cluster,
	Collection,
	GetResult,
	ISearchIndex,
	MutationResult,
	QueryResult,
	SearchQuery,
	SearchQueryOptions,
} from 'couchbase';

import * as uuid from 'uuid';

import {
	DOCUMENT_OPS,
	nodeProperties as couchbaseProperties,
	SEARCH_OPS,
} from './CouchbaseProperties';
import {
	populateCouchbaseBucketRL,
	populateCouchbaseCollectionRL,
	populateCouchbaseScopeRL,
	populateCouchbaseSearchIndexesRL,
} from '@utils/couchbase/populateCouchbaseRLs';
import { connectToCouchbase } from '@utils/couchbase/connectToCouchbase';
import { validateBucketScopeCollection } from '@utils/couchbase/validateBucketScopeCollection';

/**
 * Processes search results to remove empty objects and undefined values, then formats them into an array of IDataObject
 * @param rows
 */
function processSearchResults(rows: any[]): IDataObject[] {
	const processedData = rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).filter(
				([_, v]) => v !== undefined && !(v && typeof v === 'object' && Object.keys(v).length === 0),
			),
		),
	) as IDataObject[];

	return processedData.length > 0 ? processedData : [{ message: 'No results found' }];
}

/**
 * Transforms JSON search query to proper SDK format by nesting `knn` within a `raw` field
 * @param rawJsonQuery
 */
function transformRawJsonQueryToValidSearchOptions(rawJsonQuery: any): SearchQueryOptions {
	const { raw, ...topLevelFields } = rawJsonQuery;

	// If raw field is already present, return as is
	if (raw) {
		return rawJsonQuery as SearchQueryOptions;
	}

	// Create properly formatted SearchQueryOptions
	return {
		// Place top level fields inside the raw field
		raw: { ...topLevelFields },
	} as SearchQueryOptions;
}

/**
 * Retrieves the collection from the Couchbase cluster using the provided parameters
 * @param context
 * @param cluster
 */
async function getCollection(context: IExecuteFunctions, cluster: Cluster): Promise<Collection> {
	const couchbaseBucketName = context.getNodeParameter(
		'couchbaseBucket',
		0,
		'',
	) as INodeParameterResourceLocator;
	const couchbaseScopeName = context.getNodeParameter(
		'couchbaseScope',
		0,
		'',
	) as INodeParameterResourceLocator;
	const couchbaseCollectionName = context.getNodeParameter(
		'couchbaseCollection',
		0,
		'',
	) as INodeParameterResourceLocator;

	await validateBucketScopeCollection(
		context,
		couchbaseBucketName.value as string,
		couchbaseScopeName.value as string,
		couchbaseCollectionName.value as string,
	);

	try {
		return cluster
			.bucket(couchbaseBucketName.value as string)
			.scope(couchbaseScopeName.value as string)
			.collection(couchbaseCollectionName.value as string);
	} catch (error) {
		throw new NodeOperationError(
			context.getNode(),
			`Could not access collection: ${error.message}.`,
			{
				description:
					'Please ensure the selected bucket, scope, and collection exist and the credentials have permissions.',
			},
		);
	}
}

export class Couchbase implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Couchbase',
		name: 'couchbase',
		icon: { light: 'file:../icons/couchbase.svg', dark: 'file:../icons/couchbase.dark.svg' },
		group: ['input'],
		version: [1, 2],
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description:
			'Couchbase node to insert, update, retrieve, and delete data from a Couchbase database using KV, Query and Search services',
		defaults: {
			name: 'Couchbase',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'couchbaseApi',
				required: true,
			},
		],
		properties: couchbaseProperties,
	};

	methods = {
		listSearch: {
			populateCouchbaseBucketRL,
			populateCouchbaseScopeRL,
			populateCouchbaseCollectionRL,
			populateCouchbaseSearchIndexesRL,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const operation = this.getNodeParameter('operation', 0);

		const { cluster } = await connectToCouchbase(this);

		const returnItems: INodeExecutionData[] = [];
		let responseData: IDataObject | IDataObject[] = [];

		if (operation === DOCUMENT_OPS.CREATE) {
			const documentToInsert = this.getNodeParameter('documentValue', 0, '') as string;
			const isSpecifyDocumentId = this.getNodeParameter('isSpecifyDocumentId', 0, false) as boolean;

			let id: string;
			if (!isSpecifyDocumentId) {
				id = uuid.v4();
			} else {
				const specifiedDocumentId = this.getNodeParameter('documentId', 0, '') as string;
				id = specifiedDocumentId.trim();
			}
			const collection = await getCollection(this, cluster);
			await collection.insert(id, documentToInsert);

			responseData = [{ id: id, value: documentToInsert }];
		} else if (operation === DOCUMENT_OPS.UPSERT) {
			const newDocumentValue = this.getNodeParameter('documentValue', 0, '') as string;
			const id = this.getNodeParameter('documentId', 0, '') as string;
			const collection = await getCollection(this, cluster);
			await collection.upsert(id, newDocumentValue);
			responseData = [{ id, value: newDocumentValue }];
		} else if (operation === DOCUMENT_OPS.DELETE) {
			const documentId = this.getNodeParameter('documentId', 0, '') as string;
			const collection = await getCollection(this, cluster);
			const removeResult: MutationResult = await collection.remove(documentId);
			responseData = [{ id: documentId, value: removeResult }];
		} else if (operation === DOCUMENT_OPS.READ) {
			const documentId = this.getNodeParameter('documentId', 0, '') as string;
			const collection = await getCollection(this, cluster);
			const getResult: GetResult = await collection.get(documentId);
			const responseJson = JSON.stringify(getResult.content);
			responseData = [{ id: documentId, value: responseJson }];
		} else if (operation === DOCUMENT_OPS.QUERY) {
			const query = this.getNodeParameter('query', 0, '') as string;
			const selectedBucket = this.getNodeParameter(
				'couchbaseBucket',
				0,
			) as INodeParameterResourceLocator;
			const selectedScope = this.getNodeParameter(
				'couchbaseScope',
				0,
			) as INodeParameterResourceLocator;

			// Create query options object if bucket or scope is provided
			const queryOptions: any = {};
			if (selectedBucket.value) {
				queryOptions.queryContext = `default:${selectedBucket.value}`;

				// Add scope to query context if provided
				if (selectedScope.value) {
					queryOptions.queryContext += `.${selectedScope.value}`;
				}
			}

			const queryResult: QueryResult = await cluster.query(query, queryOptions);
			responseData = queryResult.rows;
		} else if (operation === SEARCH_OPS.RETRIEVE) {
			const isAdvancedMode = this.getNodeParameter('advancedMode', 0) as boolean;
			const indexName = this.getNodeParameter('indexName', 0, '', {
				extractValue: true,
			}) as string;
			if (isAdvancedMode) {
				const rawQuery = this.getNodeParameter('rawQuery', 0) as string;

				const transformedQuerySearchOptions = transformRawJsonQueryToValidSearchOptions(rawQuery);
				const searchResult = await cluster.searchQuery(
					indexName,
					SearchQuery.matchNone(),
					transformedQuerySearchOptions,
				);

				responseData = processSearchResults(searchResult.rows);
			} else {
				const fieldsToReturn = this.getNodeParameter('fieldsToReturn', 0) as string;
				const fieldsArray = fieldsToReturn
					? fieldsToReturn.split(',').map((field) => field.trim())
					: [];
				const searchQuery = this.getNodeParameter('searchQuery', 0) as string;
				const includeLocations = this.getNodeParameter('includeLocations', 0) as boolean;
				const resultsLimit = this.getNodeParameter('resultsLimit', 0) as number;

				const searchOptions = {
					limit: resultsLimit,
					fields: fieldsArray,
					includeLocations,
				};
				const searchResult = await cluster.searchQuery(
					indexName,
					SearchQuery.match(searchQuery),
					searchOptions,
				);

				responseData = processSearchResults(searchResult.rows);
			}
		} else if (operation === SEARCH_OPS.CREATE_INDEX) {
			const indexDefinition = this.getNodeParameter('indexDefinition', 0);
			await cluster.searchIndexes().upsertIndex(indexDefinition as ISearchIndex);
			responseData = [{ message: 'Index created successfully' }];
		}

		const items = this.getInputData();
		const itemData = generatePairedItemData(items.length);

		const executionData = this.helpers.constructExecutionMetaData(
			this.helpers.returnJsonArray(responseData),
			{ itemData },
		);

		returnItems.push(...executionData);

		return [returnItems];
	}
}

/**
 * Generates an array of paired item data
 * @param length
 * @returns IPairedItemData[] - array containing paired item data
 */
function generatePairedItemData(length: number): IPairedItemData[] {
	return Array.from({ length }, (_, item) => ({
		item,
	}));
}
