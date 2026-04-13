import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import perfectionist from 'eslint-plugin-perfectionist';
import vitest from '@vitest/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	perfectionist.configs['recommended-natural'],
	{
		files: ['**/*.{ts,tsx}'],
		plugins: {
			react: reactPlugin,
			'react-hooks': reactHooks,
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
		rules: {
			'react/react-in-jsx-scope': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
			],
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
		},
	},
	{
		files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
		...vitest.configs.recommended,
		rules: {
			...vitest.configs.recommended.rules,
			'@typescript-eslint/no-explicit-any': 'off',
			'vitest/no-conditional-expect': 'off',
		},
	},
	{
		ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs'],
	},
	eslintConfigPrettier,
);
