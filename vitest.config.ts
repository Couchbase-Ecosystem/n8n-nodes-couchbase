import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		exclude: ['node_modules', 'dist'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['nodes/**/*.ts', 'utils/**/*.ts', 'credentials/**/*.ts'],
			exclude: ['**/*.test.ts', '**/__mocks__/**', '**/fixtures/**'],
			thresholds: {
				statements: 80,
				branches: 75,
				functions: 85,
				lines: 80,
			},
		},
		setupFiles: ['./tests/setup.ts'],
		deps: {
			// Handle external dependencies that may not resolve correctly
			interopDefault: true,
		},
	},
	resolve: {
		alias: {
			'@utils': path.resolve(__dirname, './utils'),
			// Mock n8n-workflow since it's a peer dependency
			'n8n-workflow': path.resolve(__dirname, './tests/__mocks__/n8n-workflow.ts'),
		},
	},
});
