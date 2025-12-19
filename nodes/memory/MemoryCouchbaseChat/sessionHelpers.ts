import type { ISupplyDataFunctions } from 'n8n-workflow';

/**
 * Gets the session ID based on node configuration.
 * Both options use the sessionKey field - n8n evaluates expressions automatically.
 */
export function getSessionId(context: ISupplyDataFunctions, itemIndex: number): string {
	const sessionIdType = context.getNodeParameter('sessionIdType', itemIndex) as string;

	if (sessionIdType === 'fromInput') {
		let sessionKey = context.getNodeParameter('sessionKey', itemIndex, '') as string;

		// If empty, default to $json.sessionId
		if (!sessionKey || !sessionKey.trim()) {
			sessionKey = '{{ $json.sessionId }}';
		}

		// Evaluate the expression (handles both expressions and literal strings)
		const evaluated = context.evaluateExpression(sessionKey, itemIndex);

		// Return as string, or 'default' if evaluation failed
		return evaluated ? String(evaluated) : 'default';
	} else {
		// customKey mode - use the value directly
		const sessionKey = context.getNodeParameter('sessionKey', itemIndex, '') as string;
		return sessionKey.trim() || 'default';
	}
}
