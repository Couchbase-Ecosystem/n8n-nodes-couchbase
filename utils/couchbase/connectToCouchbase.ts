import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeParameterResourceLocator,
	ISupplyDataFunctions,
	NodeOperationError,
} from 'n8n-workflow';
import {
	AuthenticationFailureError,
	Bucket,
	Cluster,
	Collection,
	connect,
	CouchbaseError,
	UnambiguousTimeoutError,
} from 'couchbase';

// Declare clusterInstance outside the function scope to maintain it
let clusterInstance: Cluster | undefined;

export async function connectToCouchbase(
	context: IExecuteFunctions | ISupplyDataFunctions | ILoadOptionsFunctions,
) {
	// Check if a cluster connection already exists
	if (!clusterInstance) {
		// If not, create a new connection
		const credentials = await context.getCredentials('couchbaseApi');
		const connectionString = credentials.couchbaseConnectionString as string;
		const username = credentials.couchbaseUsername as string;
		const password = credentials.couchbasePassword as string;

		try {
			// Connecting to the database
			context.logger.info('Opening a Couchbase connection...');
			clusterInstance = await connect(connectionString, {
				username: username,
				password: password,
				timeouts: {
					connectTimeout: 10000, // 10 seconds
				},
			});
			context.logger.info('Couchbase connection established.');
		} catch (error) {
			// Ensure clusterInstance remains undefined if connection fails
			clusterInstance = undefined;
			throw new NodeOperationError(
				context.getNode(),
				`Could not connect to database: ${error.message}.`,
				{
					description: makeConnectionErrorDescription(error as CouchbaseError), // Added type assertion
				},
			);
		}
	}

	// --- Get specific collection using the (potentially reused) cluster instance ---

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

	let collection: Collection = {} as Collection;
	try {
		// Use the singleton clusterInstance here
		if (
			clusterInstance && // Ensure clusterInstance is valid before using
			typeof selectedBucket.value === 'string' &&
			typeof selectedScope.value === 'string' &&
			typeof selectedCollection.value === 'string'
		) {
			const bucket: Bucket = clusterInstance.bucket(selectedBucket.value);
			collection = bucket.scope(selectedScope.value).collection(selectedCollection.value);
		} else if (!clusterInstance) {
			// This case should ideally not be reached if the connection logic above is sound,
			// but added for robustness.
			throw new Error('Cluster connection is not available.');
		}
	} catch (error) {
		// Handle errors related to accessing bucket/scope/collection
		throw new NodeOperationError(
			context.getNode(),
			`Could not access collection: ${error.message}.`,
			{
				description:
					'Please ensure the selected bucket, scope, and collection exist and the credentials have permissions.',
			},
		);
	}

	// Return the singleton cluster and the specific collection
	return { cluster: clusterInstance, collection };
}

function makeConnectionErrorDescription(error: CouchbaseError): string {
	switch (true) {
		case error instanceof UnambiguousTimeoutError:
			return 'Please ensure the database exists, is turned on, and the connection string is correct.';
		case error instanceof AuthenticationFailureError:
			return 'Please check your username and password.';
		default:
			return '';
	}
}
