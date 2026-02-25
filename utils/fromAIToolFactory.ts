import type { DynamicStructuredTool, DynamicTool } from '@langchain/core/tools';
import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import type { FromAIArgument, IDataObject, INode, INodeParameters } from 'n8n-workflow';
import { traverseNodeParameters } from 'n8n-workflow';

/**
 * Resolve the Zod instance from n8n's own dependency tree.
 *
 * Community nodes install into ~/.n8n/nodes/ with their own node_modules,
 * creating separate Zod instances. n8n's zod-to-json-schema uses instanceof
 * checks that fail across different Zod copies. By resolving Zod from
 * n8n-workflow's module tree, we ensure our schemas use the same Zod
 * instance that n8n's serialization pipeline expects.
 */
function resolveN8nModules() {
	const nwResolved = require.resolve('n8n-workflow');
	const n8nBase = nwResolved.substring(
		0,
		nwResolved.lastIndexOf('node_modules') + 'node_modules'.length,
	);

	return {
		z: require(require.resolve('zod', { paths: [n8nBase] })),
		lcTools: require(require.resolve('@langchain/core/tools', { paths: [n8nBase] })),
	};
}

const { z: n8nZod, lcTools: n8nLcTools } = resolveN8nModules();

export type ToolFunc = (
	query: string | IDataObject,
	runManager?: CallbackManagerForToolRun,
) => Promise<string | IDataObject | IDataObject[]>;

export interface CreateToolOptions {
	name: string;
	description: string;
	func: ToolFunc;
	/**
	 * Extra arguments to include in the structured tool schema.
	 * These are added after extracting $fromAI parameters from node parameters.
	 */
	extraArgs?: FromAIArgument[];
}

/**
 * Extracts $fromAI parameters from node parameters and returns unique arguments.
 */
export function extractFromAIParameters(nodeParameters: INodeParameters): FromAIArgument[] {
	const collectedArguments: FromAIArgument[] = [];
	traverseNodeParameters(nodeParameters, collectedArguments);

	const uniqueArgsMap = new Map<string, FromAIArgument>();
	for (const arg of collectedArguments) {
		uniqueArgsMap.set(arg.key, arg);
	}

	return Array.from(uniqueArgsMap.values());
}

/**
 * Creates a Zod schema from $fromAI arguments. Adapted to work with n8n's Zod instance to ensure compatibility with n8n's serialization.
 */
function buildN8nZodSchema(args: FromAIArgument[]) {
	const schemaObj: Record<string, any> = {};
	for (const arg of args) {
		const type = arg.type || 'string';
		switch (type) {
			case 'number':
				schemaObj[arg.key] = arg.description
					? n8nZod.number().describe(arg.description)
					: n8nZod.number();
				break;
			case 'boolean':
				schemaObj[arg.key] = arg.description
					? n8nZod.boolean().describe(arg.description)
					: n8nZod.boolean();
				break;
			default:
				schemaObj[arg.key] = arg.description
					? n8nZod.string().describe(arg.description)
					: n8nZod.string();
				break;
		}
	}
	return n8nZod.object(schemaObj).required();
}

/**
 * Creates a DynamicStructuredTool if node has $fromAI parameters,
 * otherwise falls back to a simple DynamicTool.
 *
 * This is useful for creating AI agent tools that can extract parameters
 * from node configuration using $fromAI expressions.
 */
export function createToolFromNode(
	node: INode,
	options: CreateToolOptions,
): DynamicStructuredTool | DynamicTool {
	const { name, description, func, extraArgs = [] } = options;

	const collectedArguments = extractFromAIParameters(node.parameters);

	// If there are no $fromAI arguments and no extra args, fallback to simple tool
	if (collectedArguments.length === 0 && extraArgs.length === 0) {
		return new n8nLcTools.DynamicTool({ name, description, func });
	}

	// Combine collected arguments with extra arguments
	const allArguments = [...collectedArguments, ...extraArgs];
	const schema = buildN8nZodSchema(allArguments);

	return new n8nLcTools.DynamicStructuredTool({
		schema,
		name,
		description,
		func,
	});
}
