import { ISupplyDataFunctions, NodeOperationError } from 'n8n-workflow';

/**
 * Gets the session ID based on node configuration.
 * Both options use the sessionKey field - n8n evaluates expressions automatically.
 */

export function getSessionId(context: ISupplyDataFunctions, itemIndex: number): string {
	const sessionIdType = context.getNodeParameter('sessionIdType', itemIndex) as string;

	let sessionKey: string | undefined;

	if (sessionIdType === 'fromInput') {
		let sessionKeyExpression = context.getNodeParameter('sessionKey', itemIndex, '') as string;

		if (!sessionKeyExpression || !sessionKeyExpression.trim()) {
			sessionKeyExpression = '{{ $json.sessionId }}';
		}

		const evaluated = context.evaluateExpression(sessionKeyExpression, itemIndex);
		sessionKey = evaluated ? String(evaluated) : undefined;
	} else {
		sessionKey = context.getNodeParameter('sessionKey', itemIndex, '') as string;
	}

	if (!sessionKey || !sessionKey.trim()) {
		throw new NodeOperationError(
			context.getNode(),
			'Session ID is missing. Please ensure a valid Session ID is provided.',
		);
	}

	return sessionKey;
}
