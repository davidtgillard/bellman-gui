import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";

export default [
  js.configs.recommended,
  jsdoc.configs["flat/recommended-typescript"],
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      jsdoc,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "jsdoc/require-throws": "error",
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: ["throws"],
        },
      ],
      "jsdoc/valid-types": "error",
    },
  },
  {
    files: ["src/lib/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
        },
      ],
      "jsdoc/require-param": "error",
      "jsdoc/require-returns": "error",
      "jsdoc/informative-docs": "warn",
    },
  },
  {
    files: [
      "src/App.tsx",
      "src/main.tsx",
      "src/components/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "jsdoc/require-jsdoc": "off",
    },
  },
  {
    files: ["vite.config.ts", "eslint.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: ["dist", "src-tauri/target", "node_modules"],
  },
];
