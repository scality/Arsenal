import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { includeIgnoreFile } from '@eslint/compat';
import scality from '@scality/eslint-config-scality';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, '.gitignore');

export default defineConfig(
    ...scality,
    includeIgnoreFile(gitignorePath),
    {
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
        },
    },
    {
        rules: {
            'camelcase': 'off',
            'no-param-reassign': 'off',
            'new-cap': 'off',
        },
    },
    {
        files: [tseslint.globs.ts],
        extends: [tseslint.configs.recommended],
        rules: {
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: globals.jest,
        },
    },
);
