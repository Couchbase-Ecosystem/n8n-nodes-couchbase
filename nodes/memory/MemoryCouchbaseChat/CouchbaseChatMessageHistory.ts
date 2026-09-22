import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import {
	BaseMessage,
	mapChatMessagesToStoredMessages,
	mapStoredMessagesToChatMessages,
	StoredMessage,
} from '@langchain/core/messages';
import type { Collection } from 'couchbase';
import { MutateInSpec } from 'couchbase';
import { INode, NodeOperationError } from 'n8n-workflow';

export interface CouchbaseChatMessageHistoryInput {
	node: INode;
	collection: Collection;
	sessionId: string;
}

/**
 * Custom implementation of chat message history storage using Couchbase.
 * Each session's messages are stored as a single document with an array of messages.
 */
export class CouchbaseChatMessageHistory extends BaseListChatMessageHistory {
	lc_namespace = ['langchain', 'stores', 'message', 'couchbase'];

	private collection: Collection;
	private node: INode;
	private sessionId: string;
	private documentKey: string;

	constructor(fields: CouchbaseChatMessageHistoryInput) {
		super(fields);
		this.node = fields.node;
		this.collection = fields.collection;
		this.sessionId = fields.sessionId;
		this.documentKey = `chat_history::${this.sessionId}`;
	}

	/**
	 * Retrieves all messages for the current session from Couchbase.
	 */
	async getMessages(): Promise<BaseMessage[]> {
		try {
			const result = await this.collection.get(this.documentKey);
			const storedMessages = result.content.messages as StoredMessage[];
			return mapStoredMessagesToChatMessages(storedMessages);
		} catch (error: any) {
			// Document doesn't exist yet - return empty array
			if (error.name === 'DocumentNotFoundError') {
				return [];
			}
			throw new NodeOperationError(this.node, `Failed to get chat history: ${error.message}`);
		}
	}

	/**
	 * Adds a new message to the session's chat history.
	 */
	async addMessage(message: BaseMessage): Promise<void> {
		await this.addMessages([message]);
	}

	/**
	 * Adds multiple messages to the session's chat history.
	 */
	async addMessages(messages: BaseMessage[]): Promise<void> {
		const storedMessages = mapChatMessagesToStoredMessages(messages);

		try {
			// Atomically append new messages. This is efficient for existing documents.
			await this.collection.mutateIn(this.documentKey, [
				MutateInSpec.arrayAppend('messages', storedMessages, { multi: true }),
				MutateInSpec.upsert('updatedAt', new Date().toISOString()),
			]);
		} catch (error: any) {
			if (error.name === 'DocumentNotFoundError') {
				// If the document doesn't exist, create it.
				// This fallback is necessary for the first message in a session.
				await this.collection.upsert(this.documentKey, {
					sessionId: this.sessionId,
					messages: storedMessages,
					updatedAt: new Date().toISOString(),
				});
			} else {
				throw new NodeOperationError(this.node, `Failed to add chat messages: ${error.message}`);
			}
		}
	}

	/**
	 * Clears all messages for the current session.
	 */
	async clear(): Promise<void> {
		try {
			await this.collection.remove(this.documentKey);
		} catch (error: any) {
			// Ignore if document doesn't exist
			if (error.name !== 'DocumentNotFoundError') {
				throw new NodeOperationError(this.node, `Failed to clear chat history: ${error.message}`);
			}
		}
	}
}
