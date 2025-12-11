/**
 * Shared constants for the n8n-nodes-couchbase package.
 * These can be overridden via environment variables where applicable.
 */

/**
 * Connection timeout in milliseconds for establishing Couchbase connections.
 * Can be overridden via COUCHBASE_CONNECTION_TIMEOUT_MS environment variable.
 * @default 10000 (10 seconds)
 */
export const CONNECTION_TIMEOUT_MS = parseInt(
	process.env.COUCHBASE_CONNECTION_TIMEOUT_MS || '10000',
	10,
);

/**
 * Idle timeout in milliseconds before auto-closing unused connections.
 * Can be overridden via COUCHBASE_IDLE_TIMEOUT_MS environment variable.
 * @default 30000 (30 seconds)
 */
export const CONNECTION_IDLE_TIMEOUT_MS = parseInt(
	process.env.COUCHBASE_IDLE_TIMEOUT_MS || '30000',
	10,
);

/**
 * Default batch size for embedding operations in vector store.
 * Can be overridden via COUCHBASE_EMBEDDING_BATCH_SIZE environment variable.
 * @default 200
 */
export const DEFAULT_EMBEDDING_BATCH_SIZE = parseInt(
	process.env.COUCHBASE_EMBEDDING_BATCH_SIZE || '200',
	10,
);

/**
 * Maximum document ID length in bytes (Couchbase limit).
 * @default 250
 */
export const MAX_DOCUMENT_ID_LENGTH = 250;

/**
 * Minimum allowed value for search results limit.
 * @default 1
 */
export const MIN_RESULTS_LIMIT = 1;

/**
 * Maximum allowed value for search results limit.
 * @default 10000
 */
export const MAX_RESULTS_LIMIT = 10000;

/**
 * Default number of retry attempts for transient failures.
 * @default 3
 */
export const DEFAULT_RETRY_ATTEMPTS = 3;

/**
 * Default initial delay in milliseconds between retry attempts.
 * @default 1000 (1 second)
 */
export const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Multiplier for exponential backoff between retries.
 * @default 2
 */
export const RETRY_BACKOFF_MULTIPLIER = 2;
