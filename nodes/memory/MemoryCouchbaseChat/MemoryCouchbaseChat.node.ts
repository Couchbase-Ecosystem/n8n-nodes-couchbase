import { BufferWindowMemory } from 'langchain/memory';
import type {
	ISupplyDataFunctions,
	INodeType,
	INodeTypeDescription,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { BucketNotFoundError, UnambiguousTimeoutError } from 'couchbase';

import { logWrapper } from '@utils/logWrapper';
import { getConnectionHintNoticeField } from '@utils/sharedFields';
import { connectToCouchbase } from '@utils/couchbase/connectToCouchbase';
import {
	populateCouchbaseBucketRL,
	populateCouchbaseScopeRL,
	populateCouchbaseCollectionRL,
} from '@utils/couchbase/populateCouchbaseRLs';

import { CouchbaseChatMessageHistory } from './CouchbaseChatMessageHistory';
import { getSessionId } from './sessionHelpers';
import {
	sessionIdOption,
	sessionKeyProperty,
	expressionSessionKeyProperty,
	contextWindowLengthProperty,
} from './descriptions';
import {
	couchbaseBucketRL,
	couchbaseCollectionRL,
	couchbaseScopeRL,
} from './MemoryCouchbaseProperties';

export class MemoryCouchbaseChat implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Couchbase Chat Memory',
		name: 'memoryCouchbaseChat',
		icon: { light: 'file:../../icons/couchbase.svg', dark: 'file:../../icons/couchbase.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Stores the chat history in a Couchbase collection.',
		defaults: {
			name: 'Couchbase Chat Memory',
		},
		credentials: [
			{
				name: 'couchbaseApi',
				required: true,
			},
		],
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Memory'],
				Memory: ['Other memories'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://github.com/Couchbase-Ecosystem/n8n-nodes-couchbase',
					},
				],
			},
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiMemory],
		outputNames: ['Memory'],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiAgent]),
			sessionIdOption,
			expressionSessionKeyProperty(1),
			sessionKeyProperty,
			couchbaseBucketRL,
			couchbaseScopeRL,
			couchbaseCollectionRL,
			contextWindowLengthProperty,
		],
	};
	methods = {
		listSearch: {
			populateCouchbaseBucketRL,
			populateCouchbaseScopeRL,
			populateCouchbaseCollectionRL,
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const bucketName = this.getNodeParameter('couchbaseBucket', itemIndex, '', {
			extractValue: true,
		}) as string;
		const scopeName = this.getNodeParameter('couchbaseScope', itemIndex, '', {
			extractValue: true,
		}) as string;
		const collectionName = this.getNodeParameter('couchbaseCollection', itemIndex, '', {
			extractValue: true,
		}) as string;
		const contextWindowLength = this.getNodeParameter(
			'contextWindowLength',
			itemIndex,
			5,
		) as number;
		const sessionId = getSessionId(this, itemIndex);

		if (!bucketName) {
			throw new NodeOperationError(this.getNode(), 'Bucket name is required');
		}

		try {
			const { cluster } = await connectToCouchbase(this);

			// Verify bucket exists and is accessible
			const bucket = cluster.bucket(bucketName);
			const scope = bucket.scope(scopeName || '_default');
			const collection = scope.collection(collectionName || '_default');

			// Test the connection by attempting a simple operation
			// This will surface any bucket/scope/collection access issues early
			try {
				await collection.exists(`__connection_test_${Date.now()}`);
			} catch (testError: any) {
				throw handleCouchbaseError(testError, bucketName, scopeName, collectionName);
			}

			const couchbaseChatHistory = new CouchbaseChatMessageHistory({
				collection,
				sessionId,
			});

			const memory = new BufferWindowMemory({
				memoryKey: 'chat_history',
				chatHistory: couchbaseChatHistory,
				returnMessages: true,
				inputKey: 'input',
				outputKey: 'output',
				k: contextWindowLength,
			});

			return {
				response: logWrapper(memory, this),
			};
		} catch (error: any) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			throw handleCouchbaseError(error, bucketName, scopeName, collectionName);
		}
	}
}

/**
 * Handles Couchbase-specific errors and returns a user-friendly NodeOperationError
 */
function handleCouchbaseError(
	error: any,
	bucketName: string,
	scopeName: string,
	collectionName: string,
): NodeOperationError {
	if (error instanceof UnambiguousTimeoutError) {
		return new NodeOperationError(
			{ name: 'Couchbase Chat Memory', type: 'memoryCouchbaseChat', typeVersion: 1 } as any,
			`Could not access bucket "${bucketName}". The operation timed out.`,
			{
				description: `This usually means the bucket "${bucketName}" does not exist, is not active, or the credentials don't have access to it. Please verify:\n\n• The bucket "${bucketName}" exists in your Couchbase cluster\n• The bucket is active and healthy\n• Your credentials have permission to access this bucket\n• Use the dropdown to select from available buckets`,
			},
		);
	}

	if (error instanceof BucketNotFoundError) {
		return new NodeOperationError(
			{ name: 'Couchbase Chat Memory', type: 'memoryCouchbaseChat', typeVersion: 1 } as any,
			`Bucket "${bucketName}" was not found.`,
			{
				description: `The specified bucket does not exist. Please create the bucket in your Couchbase cluster or select an existing bucket from the dropdown.`,
			},
		);
	}

	// Check for scope/collection not found errors
	if (error.message?.includes('scope') || error.name === 'ScopeNotFoundError') {
		return new NodeOperationError(
			{ name: 'Couchbase Chat Memory', type: 'memoryCouchbaseChat', typeVersion: 1 } as any,
			`Scope "${scopeName}" was not found in bucket "${bucketName}".`,
			{
				description: `The specified scope does not exist. Use "_default" for the default scope or create a custom scope in your Couchbase cluster.`,
			},
		);
	}

	if (error.message?.includes('collection') || error.name === 'CollectionNotFoundError') {
		return new NodeOperationError(
			{ name: 'Couchbase Chat Memory', type: 'memoryCouchbaseChat', typeVersion: 1 } as any,
			`Collection "${collectionName}" was not found in scope "${scopeName}".`,
			{
				description: `The specified collection does not exist. Use "_default" for the default collection or create a custom collection in your Couchbase cluster.`,
			},
		);
	}

	// Generic error
	return new NodeOperationError(
		{ name: 'Couchbase Chat Memory', type: 'memoryCouchbaseChat', typeVersion: 1 } as any,
		`Couchbase error: ${error.message}`,
		{
			description:
				'Please ensure the bucket, scope, and collection exist and the credentials have appropriate permissions.',
		},
	);
}
