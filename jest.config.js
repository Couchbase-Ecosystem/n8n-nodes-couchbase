/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	// Not scoped with `roots`: that would also scope collectCoverageFrom, so untested
	// source files would silently vanish from the coverage report instead of showing 0%.
	testMatch: ['<rootDir>/test/**/*.test.ts'],
	// E2E runs against real Docker services and is driven by its own runner, not Jest.
	testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/e2e/'],
	moduleNameMapper: {
		'^@utils/(.*)$': '<rootDir>/utils/$1',
		// @langchain/community >=1.1.28 depends on uuid 14, which is ESM-only. Node loads it
		// through require(esm), but Jest's CommonJS runtime cannot, so tests resolve every
		// `uuid` import to this package's own CommonJS-compatible uuid 11.
		'^uuid$': require.resolve('uuid'),
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
	},
	collectCoverageFrom: ['nodes/**/*.ts', 'credentials/**/*.ts', 'utils/**/*.ts'],
	// The package-contract suite shells out to `npm pack`, which is slow on cold caches.
	testTimeout: 120000,
};
