import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	ISupplyDataFunctions,
	NodeOperationError,
} from 'n8n-workflow';
import {
	AuthenticationFailureError,
	Cluster,
	connect,
	CouchbaseError,
	UnambiguousTimeoutError,
} from 'couchbase';

// Declare clusterInstance and credentials cache outside the function scope
let clusterInstance: Cluster | undefined;
let cachedCredentials: {
	connectionString?: string;
	username?: string;
	password?: string;
} = {};

export async function connectToCouchbase(
	context: IExecuteFunctions | ISupplyDataFunctions | ILoadOptionsFunctions,
) {
	// Get current credentials
	const credentials = await context.getCredentials('couchbaseApi');
	const connectionString = credentials.couchbaseConnectionString as string;
	const username = credentials.couchbaseUsername as string;
	const password = credentials.couchbasePassword as string;

	// Check if credentials have changed or if connection doesn't exist
	const credentialsChanged =
		!clusterInstance ||
		connectionString !== cachedCredentials.connectionString ||
		username !== cachedCredentials.username ||
		password !== cachedCredentials.password;

	if (credentialsChanged) {
		// Close existing connection if it exists
		if (clusterInstance) {
			try {
				context.logger.info('Credentials changed, closing existing Couchbase connection...');
				await clusterInstance.close();
				context.logger.info('Previous Couchbase connection closed.');
			} catch (closeError) {
				context.logger.warn(`Error closing previous connection: ${closeError.message}`);
				// Continue anyway to establish new connection
			} finally {
				// Reset the instance regardless of close success/failure
				clusterInstance = undefined;
			}
		}

		// Create a new connection with new credentials
		try {
			context.logger.info('Opening a new Couchbase connection...');
			clusterInstance = await connect(connectionString, {
				username: username,
				password: password,
				timeouts: {
					connectTimeout: 10000, // 10 seconds
				},
			});

			// Update cached credentials
			cachedCredentials = {
				connectionString,
				username,
				password,
			};

			context.logger.info('Couchbase connection established.');
		} catch (error) {
			// Ensure clusterInstance and cachedCredentials are reset if connection fails
			clusterInstance = undefined;
			cachedCredentials = {};

			throw new NodeOperationError(
				context.getNode(),
				`Could not connect to database: ${error.message}.`,
				{
					description: makeConnectionErrorDescription(error as CouchbaseError),
				},
			);
		}
	}

		if (!clusterInstance) {
			throw new Error('Cluster connection is not available.');
		}

	return { cluster: clusterInstance };
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
