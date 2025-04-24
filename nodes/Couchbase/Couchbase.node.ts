import {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeParameterResourceLocator,
	INodeType,
	INodeTypeDescription,
	IPairedItemData,
	NodeOperationError,
} from 'n8n-workflow';

import {
	Bucket,
	BucketNotFoundError,
	Cluster,
	Collection,
	connect,
	GetResult,
	ISearchIndex,
	MutationResult,
	PingResult,
	QueryResult,
	SearchQuery,
	SearchQueryOptions,
	UnambiguousTimeoutError,
} from 'couchbase';

import * as uuid from 'uuid';

import {
	DOCUMENT_OPS,
	nodeProperties as couchbaseProperties,
	SEARCH_OPS,
} from './CouchbaseProperties';
import { populateCouchbaseSearchIndexesRL } from '@utils/couchbase/populateCouchbaseRLs';

async function connectToCouchbase(context: any) {
	const credentials = await context.getCredentials('couchbaseApi');

	const connectionString = credentials.couchbaseConnectionString as string;
	const username = credentials.couchbaseUsername as string;
	const password = credentials.couchbasePassword as string;

	const selectedBucket = context.getNodeParameter(
		'couchbaseBucket',
		0,
		'',
	) as INodeParameterResourceLocator;
	const selectedScope = context.getNodeParameter(
		'couchbaseScope',
		0,
		'',
	) as INodeParameterResourceLocator;
	const selectedCollection = context.getNodeParameter(
		'couchbaseCollection',
		0,
		'',
	) as INodeParameterResourceLocator;

	let cluster: Cluster;
	let collection: Collection = {} as Collection;
	try {
		// Connecting to the database
		cluster = await connect(connectionString, {
			username: username,
			password: password,
			configProfile: 'wanDevelopment',
		});
		if (
			typeof selectedBucket.value === 'string' &&
			typeof selectedScope.value === 'string' &&
			typeof selectedCollection.value === 'string'
		) {
			const bucket: Bucket = cluster.bucket(selectedBucket.value);
			collection = bucket.scope(selectedScope.value).collection(selectedCollection.value);
		}
	} catch (error) {
		if (error instanceof UnambiguousTimeoutError) {
			throw new NodeOperationError(
				context.getNode(),
				`Could not connect to database: ${error.message}. Be sure the database exists, is turned on, and the connection string is correct.`,
			);
		}
		throw new NodeOperationError(
			context.getNode(),
			`Could not connect to database: ${error.message}`,
		);
	}
	return { cluster, collection };
}

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

async function couchbaseBucketSearch(this: ILoadOptionsFunctions) {
	const { cluster } = await connectToCouchbase(this);

	try {
		const buckets = await cluster.buckets().getAllBuckets();
		const allBuckets = [];

		for (const bucket of buckets) {
			allBuckets.push({
				name: `${bucket.name}`,
				value: `${bucket.name}`,
			});
		}

		return { results: allBuckets };
	} catch (error) {
		throw new NodeOperationError(this.getNode(), `Error: ${error.message}`);
	} finally {
		await cluster.close();
	}
}

async function couchbaseScopeSearch(this: ILoadOptionsFunctions) {
	const selectedBucket = this.getNodeParameter('couchbaseBucket') as INodeParameterResourceLocator;

	if (!selectedBucket || !selectedBucket.value) {
		throw new NodeOperationError(this.getNode(), `Please select a bucket.`);
	}

	const { cluster } = await connectToCouchbase(this);
	try {
		const bucket = cluster.bucket(selectedBucket.value as string);
		const bucketManager = bucket.collections();

		// Get all scopes
		const scopes = await bucketManager.getAllScopes();

		// Create a flat list of all collections across all scopes
		const allScopes = [];

		for (const scope of scopes) {
			allScopes.push({
				name: `${scope.name}`,
				value: `${scope.name}`,
			});
		}

		return { results: allScopes };
	} catch (error) {
		if (error instanceof BucketNotFoundError) {
			throw new NodeOperationError(this.getNode(), `Please select a bucket.`);
		}
		throw new NodeOperationError(this.getNode(), `Error: ${error.message}`);
	} finally {
		await cluster.close();
	}
}

async function couchbaseCollectionSearch(this: ILoadOptionsFunctions) {
	const { cluster } = await connectToCouchbase(this);
	// Get selected bucket and scope from parameters
	const selectedBucket = this.getNodeParameter('couchbaseBucket') as INodeParameterResourceLocator;
	const selectedScope = this.getNodeParameter('couchbaseScope') as INodeParameterResourceLocator;

	// Check if scope is selected
	if (!selectedBucket || !selectedBucket.value || !selectedScope || !selectedScope.value) {
		throw new NodeOperationError(this.getNode(), 'Please select a bucket and scope.');
	}

	try {
		// Get bucket instance using the selected bucket name/value
		const bucketName = selectedBucket.value as string;
		const bucket = cluster.bucket(bucketName);
		const bucketManager = bucket.collections();

		// Get all scopes for the selected bucket
		const scopes = await bucketManager.getAllScopes();

		// Filter scopes if a specific scope is selected
		const filteredScopes = scopes.filter((scope) => scope.name === selectedScope.value);

		// If the selected scope doesn't exist in the bucket, throw an error
		if (filteredScopes.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				`Scope "${selectedScope.value}" not found in bucket "${bucketName}".`,
			);
		}

		// Create a flat list of all collections across filtered scopes
		const allCollections = [];

		for (const scope of filteredScopes) {
			for (const collection of scope.collections) {
				allCollections.push({
					name: `${collection.name}`,
					value: `${collection.name}`,
				});
			}
		}

		return { results: allCollections };
	} catch (error) {
		if (error instanceof BucketNotFoundError) {
			throw new NodeOperationError(this.getNode(), `Please select a bucket and scope.`);
		}
		throw new NodeOperationError(this.getNode(), `Error: ${error.message}`);
	} finally {
		await cluster.close();
	}
}

async function couchbaseCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	try {
		const { cluster } = await connectToCouchbase(this);
		const ping: PingResult = await cluster.ping();
		console.log(ping);
		await cluster.close();
	} catch (error) {
		return {
			status: 'Error',
			message: (error as Error).message,
		};
	}
	return {
		status: 'OK',
		message: 'Connection successful!',
	};
}

export class Couchbase implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Couchbase',
		name: 'couchbase',
		icon: { light: 'file:couchbase.svg', dark: 'file:couchbase.dark.svg' },
		group: ['input'],
		version: 1.0,
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
				// testedBy is not working for custom nodes per https://community.n8n.io/t/bug-cant-use-credentialtest-method-in-custom-node/94069.
				testedBy: 'couchbaseCredentialTest',
			},
		],
		properties: couchbaseProperties,
	};

	methods = {
		credentialTest: { couchbaseCredentialTest },
		listSearch: {
			couchbaseBucketSearch,
			couchbaseScopeSearch,
			couchbaseCollectionSearch,
			populateCouchbaseSearchIndexesRL,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const operation = this.getNodeParameter('operation', 0);

		const { cluster, collection } = await connectToCouchbase(this);

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
			await collection.insert(id, documentToInsert);

			responseData = [{ id: id, value: documentToInsert }];
		} else if (operation === DOCUMENT_OPS.UPSERT) {
			const newDocumentValue = this.getNodeParameter('documentValue', 0, '') as string;
			const id = this.getNodeParameter('documentId', 0, '') as string;
			await collection.upsert(id, newDocumentValue);
			responseData = [{ id, value: newDocumentValue }];
		} else if (operation === DOCUMENT_OPS.DELETE) {
			const documentId = this.getNodeParameter('documentId', 0, '') as string;
			const removeResult: MutationResult = await collection.remove(documentId);
			responseData = [{ id: documentId, value: removeResult }];
		} else if (operation === DOCUMENT_OPS.READ) {
			const documentId = this.getNodeParameter('documentId', 0, '') as string;
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

		await cluster.close();

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

function generatePairedItemData(length: number): IPairedItemData[] {
	return Array.from({ length }, (_, item) => ({
		item,
	}));
}
