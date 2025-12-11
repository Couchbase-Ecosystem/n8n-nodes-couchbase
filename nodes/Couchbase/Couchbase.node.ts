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
	CouchbaseError,
	DocumentExistsError,
	DocumentNotFoundError,
	GetResult,
	IndexNotFoundError,
	ISearchIndex,
	MutationResult,
	ParsingFailureError,
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

// Validation constants
const MAX_DOCUMENT_ID_LENGTH = 250; // Couchbase max key length in bytes
const MIN_RESULTS_LIMIT = 1;
const MAX_RESULTS_LIMIT = 10000;

/**
 * Validates a document ID and returns the trimmed value.
 * @param context - The execution context
 * @param documentId - The document ID to validate
 * @returns The validated and trimmed document ID
 */
function validateDocumentId(
	context: IExecuteFunctions,
	documentId: string,
): string {
	const trimmedId = documentId.trim();

	if (!trimmedId) {
		throw new NodeOperationError(
			context.getNode(),
			'Document ID cannot be empty',
			{
				description: 'Please provide a valid document ID.',
			},
		);
	}

	// Check byte length (Couchbase has a 250 byte limit for document keys)
	const byteLength = Buffer.byteLength(trimmedId, 'utf8');
	if (byteLength > MAX_DOCUMENT_ID_LENGTH) {
		throw new NodeOperationError(
			context.getNode(),
			`Document ID exceeds maximum length of ${MAX_DOCUMENT_ID_LENGTH} bytes`,
			{
				description: `The provided ID is ${byteLength} bytes. Please use a shorter document ID.`,
			},
		);
	}

	return trimmedId;
}

/**
 * Validates a SQL++ query string.
 * @param context - The execution context
 * @param query - The query to validate
 * @returns The validated query
 */
function validateQuery(
	context: IExecuteFunctions,
	query: string,
): string {
	const trimmedQuery = query.trim();

	if (!trimmedQuery) {
		throw new NodeOperationError(
			context.getNode(),
			'Query cannot be empty',
			{
				description: 'Please provide a valid SQL++ query.',
			},
		);
	}

	return trimmedQuery;
}

/**
 * Validates the results limit value.
 * @param context - The execution context
 * @param limit - The limit value to validate
 * @returns The validated limit
 */
function validateResultsLimit(
	context: IExecuteFunctions,
	limit: number,
): number {
	if (limit < MIN_RESULTS_LIMIT || limit > MAX_RESULTS_LIMIT) {
		throw new NodeOperationError(
			context.getNode(),
			`Results limit must be between ${MIN_RESULTS_LIMIT} and ${MAX_RESULTS_LIMIT}`,
			{
				description: `The provided limit of ${limit} is outside the valid range.`,
			},
		);
	}

	return limit;
}

/**
 * Parses and validates a document value, accepting both string JSON and objects.
 * @param context - The execution context
 * @param value - The value to parse (can be string JSON or object)
 * @returns The parsed document value
 */
function parseDocumentValue(
	context: IExecuteFunctions,
	value: unknown,
): IDataObject | IDataObject[] | string | number | boolean {
	// If it's already an object (not null, not array), return it
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as IDataObject;
	}

	// If it's an array, return it
	if (Array.isArray(value)) {
		return value as IDataObject[];
	}

	// If it's a string, try to parse as JSON
	if (typeof value === 'string') {
		const trimmed = value.trim();
		// Check if it looks like JSON (starts with { or [)
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			try {
				return JSON.parse(trimmed) as IDataObject | IDataObject[];
			} catch {
				throw new NodeOperationError(
					context.getNode(),
					'Invalid JSON in document value',
					{
						description: 'The document value appears to be JSON but could not be parsed. Please check the syntax.',
					},
				);
			}
		}
		// Return string as-is if it's not JSON-like (Couchbase supports non-JSON values)
		return value;
	}

	// Return primitives as-is (numbers, booleans, etc.)
	if (typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}

	// Default fallback - return empty object
	return {} as IDataObject;
}

/**
 * Handles Couchbase errors and throws appropriate NodeOperationError with user-friendly messages.
 * @param context - The execution context
 * @param error - The error that occurred
 * @param operation - The operation that was being performed
 * @param documentId - Optional document ID for context
 */
function handleCouchbaseError(
	context: IExecuteFunctions,
	error: unknown,
	operation: string,
	documentId?: string,
): never {
	const idContext = documentId ? ` (document ID: "${documentId}")` : '';

	if (error instanceof DocumentExistsError) {
		throw new NodeOperationError(
			context.getNode(),
			`Document already exists${idContext}`,
			{
				description: 'Use the "Upsert" operation to update existing documents, or specify a different document ID.',
			},
		);
	}

	if (error instanceof DocumentNotFoundError) {
		throw new NodeOperationError(
			context.getNode(),
			`Document not found${idContext}`,
			{
				description: 'Please verify the document ID exists in the collection.',
			},
		);
	}

	if (error instanceof ParsingFailureError) {
		throw new NodeOperationError(
			context.getNode(),
			'Query parsing failed',
			{
				description: 'Please check your SQL++ query syntax. Ensure all bucket, scope, and collection names are correct.',
			},
		);
	}

	if (error instanceof IndexNotFoundError) {
		throw new NodeOperationError(
			context.getNode(),
			'Search index not found',
			{
				description: 'Please verify the search index exists and is accessible with the current credentials.',
			},
		);
	}

	if (error instanceof CouchbaseError) {
		throw new NodeOperationError(
			context.getNode(),
			`${operation} failed: ${error.message}`,
			{
				description: 'A Couchbase error occurred. Please check your connection and try again.',
			},
		);
	}

	// Generic error handler
	throw new NodeOperationError(
		context.getNode(),
		`${operation} failed: ${(error as Error).message}`,
	);
}

/**
 * Processes search results to remove empty objects and undefined values, then formats them into an array of IDataObject.
 * Returns an empty array if no results found (consistent with other operations).
 * @param rows - The raw search result rows
 */
function processSearchResults(rows: unknown[]): IDataObject[] {
	return rows.map((row) =>
		Object.fromEntries(
			Object.entries(row as Record<string, unknown>).filter(
				([_, v]) => v !== undefined && !(v && typeof v === 'object' && Object.keys(v as object).length === 0),
			),
		),
	) as IDataObject[];
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
		version: [1.0, 1.1],
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
			const rawDocumentValue = this.getNodeParameter('documentValue', 0, '');
			const documentToInsert = parseDocumentValue(this, rawDocumentValue);
			const isSpecifyDocumentId = this.getNodeParameter('isSpecifyDocumentId', 0, false) as boolean;

			let id: string;
			if (!isSpecifyDocumentId) {
				id = uuid.v4();
			} else {
				const specifiedDocumentId = this.getNodeParameter('documentId', 0, '') as string;
				id = validateDocumentId(this, specifiedDocumentId);
			}
			const collection = await getCollection(this, cluster);

			try {
				await collection.insert(id, documentToInsert);
				responseData = [{ id: id, value: documentToInsert }];
			} catch (error) {
				handleCouchbaseError(this, error, 'Create document', id);
			}
		} else if (operation === DOCUMENT_OPS.UPSERT) {
			const rawDocumentValue = this.getNodeParameter('documentValue', 0, '');
			const newDocumentValue = parseDocumentValue(this, rawDocumentValue);
			const rawId = this.getNodeParameter('documentId', 0, '') as string;
			const id = validateDocumentId(this, rawId);
			const collection = await getCollection(this, cluster);

			try {
				await collection.upsert(id, newDocumentValue);
				responseData = [{ id, value: newDocumentValue }];
			} catch (error) {
				handleCouchbaseError(this, error, 'Upsert document', id);
			}
		} else if (operation === DOCUMENT_OPS.DELETE) {
			const rawDocumentId = this.getNodeParameter('documentId', 0, '') as string;
			const documentId = validateDocumentId(this, rawDocumentId);
			const collection = await getCollection(this, cluster);

			try {
				const removeResult: MutationResult = await collection.remove(documentId);
				responseData = [{ id: documentId, value: removeResult }];
			} catch (error) {
				handleCouchbaseError(this, error, 'Delete document', documentId);
			}
		} else if (operation === DOCUMENT_OPS.READ) {
			const rawDocumentId = this.getNodeParameter('documentId', 0, '') as string;
			const documentId = validateDocumentId(this, rawDocumentId);
			const collection = await getCollection(this, cluster);

			try {
				const getResult: GetResult = await collection.get(documentId);
				const responseJson = JSON.stringify(getResult.content);
				responseData = [{ id: documentId, value: responseJson }];
			} catch (error) {
				handleCouchbaseError(this, error, 'Read document', documentId);
			}
		} else if (operation === DOCUMENT_OPS.QUERY) {
			const rawQuery = this.getNodeParameter('query', 0, '') as string;
			const query = validateQuery(this, rawQuery);
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

			try {
				const queryResult: QueryResult = await cluster.query(query, queryOptions);
				responseData = queryResult.rows;
			} catch (error) {
				handleCouchbaseError(this, error, 'Execute query');
			}
		} else if (operation === SEARCH_OPS.RETRIEVE) {
			const isAdvancedMode = this.getNodeParameter('advancedMode', 0) as boolean;
			const indexName = this.getNodeParameter('indexName', 0, '', {
				extractValue: true,
			}) as string;

			try {
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
						? fieldsToReturn.split(',').map((field) => field.trim()).filter((f) => f.length > 0)
						: [];
					const searchQuery = this.getNodeParameter('searchQuery', 0) as string;
					const includeLocations = this.getNodeParameter('includeLocations', 0) as boolean;
					const rawResultsLimit = this.getNodeParameter('resultsLimit', 0) as number;
					const resultsLimit = validateResultsLimit(this, rawResultsLimit);

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
			} catch (error) {
				handleCouchbaseError(this, error, 'Search');
			}
		} else if (operation === SEARCH_OPS.CREATE_INDEX) {
			const indexDefinition = this.getNodeParameter('indexDefinition', 0);

			try {
				await cluster.searchIndexes().upsertIndex(indexDefinition as ISearchIndex);
				responseData = [{ message: 'Index created successfully' }];
			} catch (error) {
				handleCouchbaseError(this, error, 'Create search index');
			}
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
