import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  {
    ignores: ["eslint.config.mjs", "lib/generated/**/*"],
  },
  ...compat.extends(
    "next/core-web-vitals",
    "next/typescript",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
  ),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      quotes: [
        "error",
        "double",
        { avoidEscape: true, allowTemplateLiterals: true },
      ],
      semi: ["error", "always"],
    },
    languageOptions: {
      parserOptions: {
        project: ["tsconfig.json"],
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        {
          mode: "full",
          type: "shared",
          pattern: ["components/**/*", "hooks/**/*", "lib/**/*"],
        },
        {
          mode: "full",
          type: "feature",
          capture: ["featureName"],
          pattern: ["features/*/**/*"],
        },
        {
          mode: "full",
          type: "app",
          capture: ["_", "fileName"],
          pattern: ["app/**/*"],
        },
        {
          mode: "full",
          type: "neverImport",
          pattern: ["*"],
        },
      ],
    },
    rules: {
      "boundaries/no-unknown": [2],
      "boundaries/element-types": [
        2,
        {
          default: "disallow",
          rules: [
            {
              from: ["shared"],
              allow: ["shared"],
            },
            {
              from: ["feature"],
              allow: [
                "shared",
                ["feature", { featureName: "${from.featureName}" }],
              ],
            },
            {
              from: ["app", "neverImport"],
              allow: ["shared", "feature"],
            },
            {
              from: ["app"],
              allow: [["app", { fileName: "*.css" }]],
            },
          ],
          message:
            "Files from ${from.type} cannot import modules from ${dependency.type}.",
        },
      ],
    },
  },
];

export default eslintConfig;
