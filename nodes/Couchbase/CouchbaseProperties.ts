import type {
	IDisplayOptions,
	INodeProperties,
	INodePropertyMode,
	INodePropertyTypeOptions,
	NodePropertyTypes,
} from 'n8n-workflow';

// Define operation constants
const RESOURCE = {
	DOCUMENT: 'document',
	SEARCH: 'search',
} as const;

// Advanced display option helper function that can handle multiple conditions
type DisplayCondition = {
	[key: string]: string | string[] | boolean;
};

/**
 * Creates display options for conditionally showing fields based on multiple criteria
 *
 * @param conditions - Object where each key is a parameter name and value is the value or array of values that should trigger display
 * @returns Display options object compatible with n8n
 *
 * Example:
 *   showFor({ resource: 'search', operation: 'search', searchType: ['vector'] })
 *   // Shows the field when resource is 'search' AND operation is 'search' AND searchType is 'vector'
 */
const showFor = (conditions: DisplayCondition): IDisplayOptions => {
	// Construct the show condition object
	const show: { [key: string]: string[] | boolean[] } = {};

	Object.entries(conditions).forEach(([param, values]) => {
		if (typeof values === 'boolean') {
			show[param] = [values];
		} else {
			// Convert single value to array for consistent handling
			const valueArray = Array.isArray(values) ? values : [values];
			show[param] = valueArray;
		}
	});

	return { show };
};

// Field creator with conditional required property
type FieldOptions = {
	required?: boolean;
	description?: string;
	default?: any;
	placeholder?: string;
	[key: string]: any;
};

// Type for resource locator mode to match n8n's expected type
type ResourceLocatorMode = {
	displayName: string;
	name: string;
	type: 'string' | 'list'; // Restrict to allowed mode types
	[key: string]: any;
};

/**
 * Creates a field with varying requirements based on the provided groups
 * @param displayName
 * @param name
 * @param type
 * @param groups
 */
const createFieldWithVaryingRequirements = (
	displayName: string,
	name: string,
	type: NodePropertyTypes,
	groups: {
		conditions: DisplayCondition;
		required: boolean;
		options?: FieldOptions;
		typeOptions?: INodePropertyTypeOptions;
		modes?: ResourceLocatorMode[];
	}[],
): INodeProperties[] => {
	return groups.map((group) => {
		// Base field properties with required default property
		const baseField = {
			displayName,
			name,
			type,
			required: group.required,
			displayOptions: showFor(group.conditions),
			description: group.options?.description || '',
			placeholder: group.options?.placeholder || '',
			typeOptions: group.typeOptions || {},
			// Default is required in INodeProperties
			default: group.options?.default !== undefined ? group.options.default : '',
		};

		// Handle resource locators differently than regular fields
		if (type === 'resourceLocator') {
			return {
				...baseField,
				default: group.options?.default || { mode: 'list', value: '' },
				modes: group.modes as INodePropertyMode[], // Cast to satisfy TypeScript
				...(group.options || {}),
			} as INodeProperties; // Cast to make TypeScript happy
		}

		// For regular fields
		return {
			...baseField,
			...(group.options || {}),
		} as INodeProperties;
	});
};

// Common operations by resource
export const DOCUMENT_OPS = {
	CREATE: 'create',
	QUERY: 'query',
	READ: 'read',
	UPSERT: 'upsert',
	DELETE: 'delete',
} as const;

export const SEARCH_OPS = {
	CREATE_INDEX: 'createIndex',
	RETRIEVE: 'retrieve',
} as const;

// Search Types
export const SEARCH_TYPES = {
	SEARCH_FULL_TEXT: 'searchFullText',
} as const;

// Define option objects for document operations
const documentOperations = [
	{
		name: 'Create',
		value: DOCUMENT_OPS.CREATE,
		description: 'Insert a single document with a specified or auto-generated ID',
		action: 'Create a document',
	},
	{
		name: 'Query',
		value: DOCUMENT_OPS.QUERY,
		description: 'Execute SQL++ queries to retrieve or manipulate documents',
		action: 'Query documents',
	},
	{
		name: 'Read',
		value: DOCUMENT_OPS.READ,
		description: 'Retrieve a document by its ID',
		action: 'Read a document',
	},
	{
		name: 'Upsert',
		value: DOCUMENT_OPS.UPSERT,
		description:
			'Modify an existing document identified by its ID, or create a new one if it does not exist',
		action: 'Upsert a document',
	},
	{
		name: 'Delete',
		value: DOCUMENT_OPS.DELETE,
		description: 'Remove a document by its ID',
		action: 'Delete a document',
	},
];

// Define option objects for search operations
const searchOperations = [
	{
		name: 'Create Index',
		value: SEARCH_OPS.CREATE_INDEX,
		description: 'Create a new search index',
		action: 'Create a search index',
	},
	{
		name: 'Search & Retrieve',
		value: SEARCH_OPS.RETRIEVE,
		description: 'Perform full-text search',
		action: 'Search and retrieve documents',
	},
];

// Search type options
const searchTypeOptions = [
	{
		name: 'Couchbase Search Full Text',
		value: SEARCH_TYPES.SEARCH_FULL_TEXT,
		description: 'Perform a Couchbase full-text search',
	},
];

// Defaults
const DOCUMENT_RESOURCE_VALUE = RESOURCE.DOCUMENT;
const DOCUMENT_OPS_QUERY_VALUE = DOCUMENT_OPS.QUERY;
const SEARCH_OPS_SEARCH_VALUE = SEARCH_OPS.RETRIEVE;
const SEARCH_TYPE_FULL_TEXT_VALUE = SEARCH_TYPES.SEARCH_FULL_TEXT;

export const nodeProperties: INodeProperties[] = [
	// Resource selector
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Document & Key-Value',
				value: RESOURCE.DOCUMENT,
				description:
					'Create, read, upsert, and delete documents using direct key-value operations and execute SQL++ queries',
			},
			{
				name: 'Search',
				value: RESOURCE.SEARCH,
				description: 'Create and manage indexes, perform full-text searches',
			},
		],
		default: DOCUMENT_RESOURCE_VALUE,
	},

	// Document Operations
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: showFor({ resource: RESOURCE.DOCUMENT }),
		options: documentOperations,
		default: DOCUMENT_OPS_QUERY_VALUE,
	},

	// Search Operations
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: showFor({ resource: RESOURCE.SEARCH }),
		options: searchOperations,
		default: SEARCH_OPS_SEARCH_VALUE,
	},
	{
		displayName: 'Search Type',
		name: 'searchType',
		type: 'options',
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
		}),
		options: searchTypeOptions,
		default: SEARCH_TYPE_FULL_TEXT_VALUE,
		description: 'Type of search to perform',
	},

	...createFieldWithVaryingRequirements(
		'Couchbase Bucket',
		'couchbaseBucket',
		'resourceLocator' as NodePropertyTypes,
		[
			{
				conditions: {
					resource: RESOURCE.DOCUMENT,
					operation: [
						DOCUMENT_OPS.CREATE,
						DOCUMENT_OPS.READ,
						DOCUMENT_OPS.UPSERT,
						DOCUMENT_OPS.DELETE,
					],
				},
				required: true,
				options: {
					description: 'Couchbase bucket',
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'couchbaseBucketSearch',
						},
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						placeholder: 'e.g. my_bucket',
					},
				],
			},
			{
				conditions: {
					resource: RESOURCE.DOCUMENT,
					operation: [DOCUMENT_OPS.QUERY],
				},
				required: false,
				options: {
					description: 'Couchbase bucket (optional for this operation)',
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'couchbaseBucketSearch',
						},
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						placeholder: 'e.g. my_bucket',
					},
				],
			},
		],
	),

	...createFieldWithVaryingRequirements(
		'Couchbase Scope',
		'couchbaseScope',
		'resourceLocator' as NodePropertyTypes,
		[
			{
				conditions: {
					resource: RESOURCE.DOCUMENT,
					operation: [
						DOCUMENT_OPS.CREATE,
						DOCUMENT_OPS.READ,
						DOCUMENT_OPS.UPSERT,
						DOCUMENT_OPS.DELETE,
					],
				},
				required: true,
				options: {
					description: 'The Couchbase scope to use',
				},
				typeOptions: {
					loadOptionsDependsOn: ['couchbaseBucket.value'],
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'couchbaseScopeSearch',
						},
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						placeholder: 'e.g. my_scope',
					},
				],
			},
			{
				conditions: {
					resource: RESOURCE.DOCUMENT,
					operation: [DOCUMENT_OPS.QUERY],
				},
				required: false,
				options: {
					description: 'The Couchbase scope to use (optional for this operation)',
				},
				typeOptions: {
					loadOptionsDependsOn: ['couchbaseBucket.value'],
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'couchbaseScopeSearch',
						},
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						placeholder: 'e.g. my_scope',
					},
				],
			},
		],
	),

	{
		displayName: 'Couchbase Collection',
		name: 'couchbaseCollection',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: showFor({
			resource: RESOURCE.DOCUMENT,
			operation: [DOCUMENT_OPS.CREATE, DOCUMENT_OPS.READ, DOCUMENT_OPS.UPSERT, DOCUMENT_OPS.DELETE],
		}),
		typeOptions: {
			loadOptionsDependsOn: ['couchbaseBucket.value', 'couchbaseScope.value'],
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'couchbaseCollectionSearch',
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				placeholder: 'e.g. my_collection',
			},
		],
	},

	{
		displayName: 'Specify Document ID',
		name: 'isSpecifyDocumentId',
		type: 'boolean',
		displayOptions: showFor({ resource: RESOURCE.DOCUMENT, operation: [DOCUMENT_OPS.CREATE] }),
		default: false,
		description:
			'Whether to use a user specified document ID. If false, a new ID will be generated.',
	},

	// Common document operations fields
	...createFieldWithVaryingRequirements(
		'Document ID',
		'documentId',
		'string' as NodePropertyTypes,
		[
			{
				conditions: {
					resource: RESOURCE.DOCUMENT,
					operation: [DOCUMENT_OPS.UPSERT, DOCUMENT_OPS.DELETE, DOCUMENT_OPS.READ],
				},
				required: true,
				options: {
					default: '',
					description: 'ID of the document to create',
					placeholder: 'my-document-ID',
				},
			},
			{
				conditions: {
					resource: RESOURCE.DOCUMENT,
					operation: [DOCUMENT_OPS.CREATE],
					isSpecifyDocumentId: true,
				},
				required: true,
				options: {
					default: '',
					description: 'ID of the document to create',
					placeholder: 'my-document-ID',
				},
			},
		],
	),

	// Create document fields
	{
		displayName: 'Document Value',
		name: 'documentValue',
		type: 'json',
		displayOptions: showFor({
			resource: RESOURCE.DOCUMENT,
			operation: [DOCUMENT_OPS.CREATE, DOCUMENT_OPS.UPSERT],
		}),
		default: '',
		description: 'Document content in JSON format',
	},

	// Query operation fields
	{
		displayName: 'Run Query',
		name: 'query',
		type: 'string',
		displayOptions: showFor({ resource: RESOURCE.DOCUMENT, operation: [DOCUMENT_OPS.QUERY] }),
		typeOptions: {
			rows: 5,
		},
		default: '',
		placeholder: 'e.g. SELECT * FROM users WHERE name="Michael"',
		description: 'The SQL++ query to execute',
	},

	// Create Index field
	{
		displayName: 'Index Definition',
		name: 'indexDefinition',
		type: 'json',
		typeOptions: {
			rows: 20,
		},
		required: true,
		displayOptions: showFor({ resource: RESOURCE.SEARCH, operation: [SEARCH_OPS.CREATE_INDEX] }),
		description:
			'The JSON object defining the index. See the Couchbase Search documentation for details.',
		default: '',
		validateType: 'object',
	},

	// Common search fields
	{
		displayName: 'Index Name',
		name: 'indexName',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The name of the search index to query',
		typeOptions: {
			loadOptionsDependsOn: [
				'useScopedIndex',
				'couchbaseBucket.value',
				'couchbaseScope.value',
				'couchbaseCollection.value',
			],
		},
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
		}),
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
	},

	{
		displayName: 'Advanced Mode',
		name: 'advancedMode',
		type: 'boolean',
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
		}),
		default: false,
		description: 'Whether to use advanced mode to provide a raw JSON query',
	},

	// Full-text search specific fields
	{
		displayName: 'Search Query',
		name: 'searchQuery',
		type: 'string',
		required: true,
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
			advancedMode: false,
		}),
		default: '',
		description: 'The full-text search query to execute',
	},

	{
		displayName: 'Fields to Return',
		name: 'fieldsToReturn',
		type: 'string',
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
			advancedMode: false,
		}),
		default: '*',
		description:
			'Comma-separated list of fields to return in the search results, * for all fields, or empty for no fields',
	},

	{
		displayName: 'Limit',
		name: 'resultsLimit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
			advancedMode: false,
		}),
		default: 5,
		description: 'Max number of results to return',
	},

	{
		displayName: 'Include Locations',
		name: 'includeLocations',
		type: 'boolean',
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
			advancedMode: false,
		}),
		default: false,
		description: 'Whether to include term locations in the search results',
	},

	{
		displayName: 'Raw Search Query',
		name: 'rawQuery',
		type: 'json',
		typeOptions: {
			rows: 20,
		},
		displayOptions: showFor({
			resource: RESOURCE.SEARCH,
			operation: [SEARCH_OPS.RETRIEVE],
			advancedMode: true,
		}),
		default: '',
		description: 'A raw search query in JSON format',
		validateType: 'object',
	},
];
