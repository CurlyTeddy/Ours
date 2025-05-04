import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  ...compat.extends(
    "next/core-web-vitals",
    "next/typescript",
    "plugin:@typescript-eslint/recommended",
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
  ),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'quotes': ['error', 'double', { avoidEscape: true, allowTemplateLiterals: true }],
      'semi': ['error', 'always'],
    },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      }
    },
  },
];

export default eslintConfig;
