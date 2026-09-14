import { getSessionId } from '../../nodes/memory/MemoryCouchbaseChat/sessionHelpers';
import { mockExecuteFunctions } from '../helpers/mock-context';
import type { ISupplyDataFunctions } from 'n8n-workflow';

function ctxWith(params: Record<string, unknown>, evaluated?: unknown) {
	const ctx = mockExecuteFunctions({ params });
	(ctx as unknown as { evaluateExpression: jest.Mock }).evaluateExpression = jest
		.fn()
		.mockReturnValue(evaluated);
	return ctx as unknown as ISupplyDataFunctions;
}

describe('getSessionId', () => {
	it('returns a manually configured session key', () => {
		const ctx = ctxWith({ sessionIdType: 'fromInput_manual', sessionKey: 'session-42' });
		expect(getSessionId(ctx, 0)).toBe('session-42');
	});

	it('evaluates the expression when reading the key from input', () => {
		const ctx = ctxWith(
			{ sessionIdType: 'fromInput', sessionKey: '{{ $json.sessionId }}' },
			'evaluated-session',
		);
		expect(getSessionId(ctx, 0)).toBe('evaluated-session');
	});

	it('falls back to $json.sessionId when no expression is configured', () => {
		const ctx = ctxWith({ sessionIdType: 'fromInput', sessionKey: '   ' }, 'from-default');
		expect(getSessionId(ctx, 0)).toBe('from-default');
		expect(
			(ctx as unknown as { evaluateExpression: jest.Mock }).evaluateExpression,
		).toHaveBeenCalledWith('{{ $json.sessionId }}', 0);
	});

	it('coerces non-string evaluation results', () => {
		const ctx = ctxWith({ sessionIdType: 'fromInput', sessionKey: '{{ $json.id }}' }, 12345);
		expect(getSessionId(ctx, 0)).toBe('12345');
	});

	it.each([
		['an empty manual key', { sessionIdType: 'manual', sessionKey: '' }, undefined],
		['a whitespace manual key', { sessionIdType: 'manual', sessionKey: '   ' }, undefined],
		['an expression that evaluates to empty', { sessionIdType: 'fromInput', sessionKey: '{{ x }}' }, ''],
	])('throws on %s', (_label, params, evaluated) => {
		expect(() => getSessionId(ctxWith(params, evaluated), 0)).toThrow(/Session ID is missing/);
	});
});
