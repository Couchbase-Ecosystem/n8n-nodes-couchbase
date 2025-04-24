import { IExecuteFunctions, ISupplyDataFunctions, NodeOperationError } from 'n8n-workflow';
import { connectToCouchbase } from './connectToCouchbase';
import { BucketNotFoundError } from 'couchbase';

export async function validateBucketScopeCollection(
	context: IExecuteFunctions | ISupplyDataFunctions,
	bucketName: string,
	scopeName: string,
	collectionName: string,
): Promise<void> {
	// Input validation
	if (!bucketName) {
		throw new NodeOperationError(context.getNode(), 'Bucket name is required');
	}
	if (!scopeName) {
		throw new NodeOperationError(context.getNode(), 'Scope name is required');
	}
	if (!collectionName) {
		throw new NodeOperationError(context.getNode(), 'Collection name is required');
	}

	const { cluster } = await connectToCouchbase(context);

	try {
		// First check if bucket exists
		try {
			const bucket = cluster.bucket(bucketName);
			const bucketManager = bucket.collections();

			// Get all scopes in the bucket
			const scopes = await bucketManager.getAllScopes();

			// Find the specified scope within the bucket
			const targetScope = scopes.find((scope) => scope.name === scopeName);
			if (!targetScope) {
				throw new NodeOperationError(
					context.getNode(),
					`Scope "${scopeName}" not found in bucket "${bucketName}".`,
					{
						description: `Please ensure the scope exists in the specified bucket.`,
					},
				);
			}

			// Find the specified collection within the scope
			const targetCollection = targetScope.collections.find(
				(collection) => collection.name === collectionName,
			);
			if (!targetCollection) {
				throw new NodeOperationError(
					context.getNode(),
					`Collection "${collectionName}" not found in scope "${scopeName}" of bucket "${bucketName}".`,
					{
						description: `Please ensure the collection exists in the specified scope.`,
					},
				);
			}

			// If we get here, all components exist and have the correct hierarchical relationship
			return;
		} catch (error) {
			if (error instanceof BucketNotFoundError) {
				throw new NodeOperationError(context.getNode(), `Bucket "${bucketName}" not found.`, {
					description: 'Please censure the bucket exists in your Couchbase cluster.',
				});
			}
			// Re-throw other errors that might have occurred
			throw error;
		}
	} catch (error) {
		// If it's not already a NodeOperationError, wrap it
		if (!(error instanceof NodeOperationError)) {
			throw new NodeOperationError(context.getNode(), `Error: ${error.message}`);
		}
		throw error;
	}
}
