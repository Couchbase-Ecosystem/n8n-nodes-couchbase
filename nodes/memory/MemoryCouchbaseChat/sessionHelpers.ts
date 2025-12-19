import type { ISupplyDataFunctions } from 'n8n-workflow';

/**
 * Gets the session ID based on node configuration.
 * Both options use the sessionKey field - n8n evaluates expressions automatically.
 */
export function getSessionId(context: ISupplyDataFunctions, itemIndex: number): string {
	const sessionKey = context.getNodeParameter('sessionKey', itemIndex, '') as string;

	if (sessionKey && sessionKey.trim()) {
		return sessionKey.trim();
	}

	return 'default';
}
