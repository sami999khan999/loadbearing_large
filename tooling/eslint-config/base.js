import js from "@eslint/js";
import tseslint from "typescript-eslint";

export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        { accessibility: "explicit", overrides: { constructors: "no-public" } },
      ],
      "@typescript-eslint/parameter-properties": ["error", { prefer: "parameter-property" }],
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/require-await": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "No package reads its own configuration. Config is read once in apps/*/src/env.ts and passed down as constructor arguments.",
        },
      ],
    },
  },
  { ignores: ["dist/**", ".output/**", "*.config.*"] },
);

export default base;
