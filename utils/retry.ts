import { TimeoutError, TemporaryFailureError } from 'couchbase';

import {
	DEFAULT_RETRY_ATTEMPTS,
	DEFAULT_RETRY_DELAY_MS,
	RETRY_BACKOFF_MULTIPLIER,
} from './constants';

/**
 * Options for retry behavior.
 */
export interface RetryOptions {
	/** Maximum number of retry attempts. Default: 3 */
	maxAttempts?: number;
	/** Initial delay between retries in milliseconds. Default: 1000 */
	delayMs?: number;
	/** Multiplier for exponential backoff. Default: 2 */
	backoffMultiplier?: number;
	/** Custom function to determine if an error is retryable */
	isRetryable?: (error: Error) => boolean;
}

/**
 * Default list of error types that are considered retryable.
 * These are transient errors that may succeed on retry.
 */
const DEFAULT_RETRYABLE_ERRORS = [TimeoutError, TemporaryFailureError];

/**
 * Default function to check if an error is retryable.
 */
function defaultIsRetryable(error: Error): boolean {
	return DEFAULT_RETRYABLE_ERRORS.some(
		(errorClass) => error instanceof errorClass,
	);
}

/**
 * Executes an async operation with automatic retry on transient failures.
 * Uses exponential backoff between retry attempts.
 *
 * @param operation - The async operation to execute
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => collection.get(documentId),
 *   { maxAttempts: 3, delayMs: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const {
		maxAttempts = DEFAULT_RETRY_ATTEMPTS,
		delayMs = DEFAULT_RETRY_DELAY_MS,
		backoffMultiplier = RETRY_BACKOFF_MULTIPLIER,
		isRetryable = defaultIsRetryable,
	} = options;

	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;

			// Check if this error is retryable
			const shouldRetry = isRetryable(lastError);

			// If not retryable or last attempt, throw immediately
			if (!shouldRetry || attempt === maxAttempts) {
				throw error;
			}

			// Calculate delay with exponential backoff
			const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);

			// Wait before next retry
			await sleep(delay);
		}
	}

	// This should never be reached, but TypeScript needs it
	throw lastError;
}

/**
 * Sleeps for the specified duration.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a retry function with pre-configured options.
 * Useful for creating specialized retry utilities.
 *
 * @param defaultOptions - Default options to apply to all retries
 * @returns A configured retry function
 *
 * @example
 * ```typescript
 * const retryWithDefaults = createRetryFunction({ maxAttempts: 5, delayMs: 500 });
 * const result = await retryWithDefaults(() => someOperation());
 * ```
 */
export function createRetryFunction(
	defaultOptions: RetryOptions,
): <T>(operation: () => Promise<T>, options?: RetryOptions) => Promise<T> {
	return <T>(operation: () => Promise<T>, options: RetryOptions = {}) =>
		withRetry(operation, { ...defaultOptions, ...options });
}
