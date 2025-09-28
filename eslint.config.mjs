import boundaries from "eslint-plugin-boundaries";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const eslintConfig = [
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    ignores: ["lib/generated/**/*"],
  },
  {
    name: "Next Plugins",
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    name: "Hook Plugins",
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    name: "Style Check",
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      quotes: [
        "error",
        "double",
        { avoidEscape: true, allowTemplateLiterals: true },
      ],
      semi: ["error", "always"],
    },
  },
  {
    name: "Dependency Check",
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
