import {
	ILoadOptionsFunctions,
	INodeParameterResourceLocator,
	NodeOperationError,
} from 'n8n-workflow';
import { connectToCouchbase } from './connectToCouchbase';
import { BucketNotFoundError } from 'couchbase';

export async function populateCouchbaseBucketRL(this: ILoadOptionsFunctions) {
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
	}
}

export async function populateCouchbaseScopeRL(this: ILoadOptionsFunctions) {
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
	}
}

export async function populateCouchbaseCollectionRL(this: ILoadOptionsFunctions) {
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
	}
}

export async function populateCouchbaseSearchIndexesRL(this: ILoadOptionsFunctions) {
	const { cluster } = await connectToCouchbase(this);
	try {
		const allIndexes = [];

		const useScopedIndex = this.getNodeParameter('useScopedIndex') as boolean;
		if (useScopedIndex) {
			const selectedBucket = this.getNodeParameter(
				'couchbaseBucket',
			) as INodeParameterResourceLocator;
			const selectedScope = this.getNodeParameter(
				'couchbaseScope',
			) as INodeParameterResourceLocator;

			const scope = cluster
				.bucket(selectedBucket.value as string)
				.scope(selectedScope.value as string);
			const scopedSearchIndexes = await scope.searchIndexes().getAllIndexes();

			for (const idx of scopedSearchIndexes) {
				allIndexes.push({
					name: `${idx.name}`,
					value: `${idx.name}`,
				});
			}
		} else {
			const searchIndexes = await cluster.searchIndexes().getAllIndexes();
			for (const idx of searchIndexes) {
				allIndexes.push({
					name: `${idx.name}`,
					value: `${idx.name}`,
				});
			}
		}

		return { results: allIndexes };
	} catch (error) {
		throw new NodeOperationError(this.getNode(), `Error: ${error.message}`);
	}
}
