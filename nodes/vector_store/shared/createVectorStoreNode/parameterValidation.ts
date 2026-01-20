import type { INode } from 'n8n-workflow';

export function assertParamIsNumber(
	parameterName: string,
	value: unknown,
	node: INode,
): asserts value is number {
	if (typeof value !== 'number') {
		throw new Error(
			`Parameter '${parameterName}' in node '${node.name}' must be a number, got ${typeof value}`,
		);
	}
}

export function assertParamIsBoolean(
	parameterName: string,
	value: unknown,
	node: INode,
): asserts value is boolean {
	if (typeof value !== 'boolean') {
		throw new Error(
			`Parameter '${parameterName}' in node '${node.name}' must be a boolean, got ${typeof value}`,
		);
	}
}
