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

// Connection configuration constants
const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
const CONNECTION_IDLE_TIMEOUT_MS = 30000; // 30 seconds - auto-close after inactivity

// Declare clusterInstance and credentials cache outside the function scope
let clusterInstance: Cluster | undefined;
let cachedCredentials: {
	connectionString?: string;
	username?: string;
	password?: string;
} = {};
let idleTimeoutId: ReturnType<typeof setTimeout> | undefined;
let lastActivityTime: number = 0;

/**
 * Resets the idle timeout timer. Called on each connection activity.
 */
function resetIdleTimeout(): void {
	if (idleTimeoutId) {
		clearTimeout(idleTimeoutId);
	}
	lastActivityTime = Date.now();
	idleTimeoutId = setTimeout(async () => {
		await closeConnection();
	}, CONNECTION_IDLE_TIMEOUT_MS);
}

/**
 * Closes the current Couchbase connection and clears cached state.
 * Can be called manually or automatically via idle timeout.
 */
export async function closeConnection(): Promise<void> {
	if (idleTimeoutId) {
		clearTimeout(idleTimeoutId);
		idleTimeoutId = undefined;
	}
	if (clusterInstance) {
		try {
			await clusterInstance.close();
		} catch {
			// Ignore errors during close - connection may already be closed
		} finally {
			clusterInstance = undefined;
			cachedCredentials = {};
			lastActivityTime = 0;
		}
	}
}

/**
 * Gets the time since last connection activity in milliseconds.
 * Returns 0 if no connection has been established.
 */
export function getConnectionIdleTime(): number {
	if (lastActivityTime === 0) return 0;
	return Date.now() - lastActivityTime;
}

/**
 * Checks if there is an active connection.
 */
export function hasActiveConnection(): boolean {
	return clusterInstance !== undefined;
}

/**
 * Connects to Couchbase using the provided credentials.
 * If the credentials have changed, it closes the existing connection and opens a new one.
 *
 * @param context - The context object containing credentials and logger.
 * @returns {Promise<{ cluster: Cluster }>} - The connected cluster instance.
 * @throws {NodeOperationError} - If the connection fails or if the cluster instance is not available.
 */
export async function connectToCouchbase(
	context: IExecuteFunctions | ISupplyDataFunctions | ILoadOptionsFunctions,
): Promise<{ cluster: Cluster; }> {
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
					connectTimeout: CONNECTION_TIMEOUT_MS,
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
				`Could not connect to database: ${(error as Error).message}.`,
				{
					description: makeConnectionErrorDescription(error as CouchbaseError),
				},
			);
		}
	}

	if (!clusterInstance) {
		throw new Error('Cluster connection is not available.');
	}

	// Reset idle timeout on each successful connection use
	resetIdleTimeout();

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
