/**
 * Mock for n8n-workflow peer dependency
 */

export class NodeOperationError extends Error {
	constructor(
		public node: unknown,
		message: string,
		public options?: { description?: string; functionality?: string },
	) {
		super(message);
		this.name = 'NodeOperationError';
	}
}

export const BINARY_ENCODING = 'base64';

export const NodeConnectionTypes = {
	AiMemory: 'ai_memory',
	AiVectorStore: 'ai_vectorStore',
	AiRetriever: 'ai_retriever',
	AiEmbedding: 'ai_embedding',
	AiTool: 'ai_tool',
	AiDocument: 'ai_document',
	AiTextSplitter: 'ai_textSplitter',
	Main: 'main',
};

export function parseErrorMetadata(error: Error): Record<string, unknown> {
	return { message: error.message };
}

// Type exports (these are just type definitions, not runtime values)
export type IExecuteFunctions = {
	getCredentials: (name: string) => Promise<Record<string, unknown>>;
	getNode: () => { name: string };
	getNodeParameter: (name: string, index: number, defaultValue?: unknown) => unknown;
	getInputData: () => unknown[];
	helpers: {
		assertBinaryData: (index: number, key: string) => { mimeType: string; id?: string; data?: string };
		binaryToBuffer: (stream: unknown) => Promise<Buffer>;
		getBinaryStream: (id: string) => Promise<unknown>;
		constructExecutionMetaData: (data: unknown[], options: unknown) => unknown[];
		returnJsonArray: (data: unknown) => unknown[];
	};
	logger: {
		info: (message: string) => void;
		warn: (message: string) => void;
		error: (message: string) => void;
	};
	addInputData: (connectionType: string, data: unknown[]) => { index: number };
	addOutputData: (connectionType: string, index: number, error: Error, metadata: unknown) => void;
};

export type ISupplyDataFunctions = IExecuteFunctions;

export type ILoadOptionsFunctions = {
	getCredentials: (name: string) => Promise<Record<string, unknown>>;
	getNode: () => { name: string };
	logger: {
		info: (message: string) => void;
		warn: (message: string) => void;
		error: (message: string) => void;
	};
};

export type INodeExecutionData = {
	json: Record<string, unknown>;
	binary?: Record<string, unknown>;
};

export type IDataObject = Record<string, unknown>;

export type INodeProperties = {
	displayName: string;
	name: string;
	type: string;
	default: unknown;
	description?: string;
	required?: boolean;
	options?: unknown[];
	displayOptions?: unknown;
	typeOptions?: unknown;
	placeholder?: string;
};

export type INodeParameterResourceLocator = {
	value: string | undefined;
	mode: string;
};

export type INodeType = {
	description: unknown;
	methods?: unknown;
	execute: () => Promise<unknown[][]>;
};

export type INodeTypeDescription = Record<string, unknown>;

export type IPairedItemData = {
	item: number;
};

export type ICredentialType = {
	name: string;
	displayName: string;
	properties: INodeProperties[];
};

export type ICredentialTestRequest = {
	request: {
		baseURL: string;
		url: string;
		skipSslCertificateValidation?: boolean;
	};
};

export type Icon = {
	light: string;
	dark: string;
};

export type NodeConnectionType = string;

export type IBinaryData = {
	mimeType: string;
	id?: string;
	data?: string;
};

export type ITaskMetadata = Record<string, unknown>;
