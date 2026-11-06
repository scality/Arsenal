import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';
import { includeIgnoreFile } from '@eslint/compat';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, '.gitignore');
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default tseslint.config(
    ...compat.extends('@scality/scality'),
    ...tseslint.configs.recommended,
    includeIgnoreFile(gitignorePath),
    {
        // Many JavaScript files were not linted for a while and kept disable
        // comments that no longer apply; removing them is left to the
        // Prettier reformat, which rewrites these files anyway.
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
        rules: {
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'camelcase': 'off',
            'no-param-reassign': 'off',
            'new-cap': 'off',
            'quotes': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: globals.jest,
        },
    },
    // Must be last: turns off ESLint formatting rules that conflict with
    // Prettier (indent, max-len, …) so Prettier owns formatting.
    eslintConfigPrettier,
);
