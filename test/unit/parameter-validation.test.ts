import {
	assertParamIsBoolean,
	assertParamIsNumber,
} from '../../nodes/vector_store/shared/createVectorStoreNode/parameterValidation';
import { TEST_NODE } from '../helpers/mock-context';

describe('parameter validation assertions', () => {
	it('accepts a number', () => {
		expect(() => assertParamIsNumber('topK', 4, TEST_NODE)).not.toThrow();
	});

	it('rejects a non-number and names the parameter and node', () => {
		expect(() => assertParamIsNumber('topK', '4', TEST_NODE)).toThrow(
			"Parameter 'topK' in node 'Couchbase' must be a number, got string",
		);
	});

	it('accepts a boolean', () => {
		expect(() => assertParamIsBoolean('useReranker', false, TEST_NODE)).not.toThrow();
	});

	it('rejects a non-boolean and names the parameter and node', () => {
		expect(() => assertParamIsBoolean('useReranker', 'false', TEST_NODE)).toThrow(
			"Parameter 'useReranker' in node 'Couchbase' must be a boolean, got string",
		);
	});
});
