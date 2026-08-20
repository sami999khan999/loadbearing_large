import tseslint from "typescript-eslint";

const OOP_PACKAGES = [
  "packages/{core,permissions,errors,contracts,application,db,infrastructure,auth,composition,api-client,asset,content}/src/**/*.ts",
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.output/**",
      "**/migrations/**",
      // Not inside any package's tsconfig `include`, so projectService cannot
      // resolve them and a type-aware rule fails with a parsing error.
      // Deliberately NOT "*.config.*" — that also matches eslint.config.js
      // itself, which makes editors warn on every open config file.
      "**/*.config.ts",
      "**/*.config.mts",
      "**/*.d.ts",
    ],
  },

  // ── Everything: the typed rules Biome cannot run ──
  {
    files: ["packages/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/parameter-properties": ["error", { prefer: "parameter-property" }],
      // Biome owns these; don't double-report.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },

  // ── Non-React packages only: the OOP shape rules ──
  {
    files: OOP_PACKAGES,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportNamedDeclaration > FunctionDeclaration",
          message: "No exported free functions. Put behaviour on a class (static if stateless).",
        },
        {
          selector:
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
          message: "No exported arrow functions. Put behaviour on a class (static if stateless).",
        },
        {
          selector: "ExportDefaultDeclaration > FunctionDeclaration",
          message: "No exported free functions. Put behaviour on a class (static if stateless).",
        },
        {
          selector: "ClassBody > PropertyDefinition[static=true][readonly!=true]",
          message: "Static mutable state is banned — it leaks across requests and tests.",
        },
      ],
    },
  },

  // ── feature: bans that need a type-import exemption, which Biome cannot express ──
  {
    files: ["packages/feature/src/**/*.{ts,tsx}"],
    rules: {
      // Off, so the @typescript-eslint variant below owns this rule entirely.
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@loadbearing/api-client",
              allowTypeImports: true,
              message:
                "Every read goes through a defined query in @loadbearing/query. A raw client call inside a component is an uncached read that no invalidation touches.",
            },
            {
              name: "@tanstack/react-router",
              allowTypeImports: true,
              message:
                "Routing lives in apps/web. Pass navigation in as an onNavigate prop or an href string.",
            },
          ],
        },
      ],
    },
  },

  // ── application throws errors, never status codes (see docs/setup/09) ──
  {
    files: ["packages/application/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@loadbearing/errors",
              importNames: ["HTTP_STATUS"],
              message:
                "A status code is a transport concern. Throw the error; the adapter maps it. That discipline is what keeps the transport swappable.",
            },
          ],
        },
      ],
    },
  },

  // ── content may name a module, never a permission (see docs/setup/20) ──
  {
    files: ["packages/content/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@loadbearing/permissions",
              importNames: ["PermissionKey", "PermissionRegistry"],
              message:
                "Content names a module. ModuleRegistry owns which permission gates it. Import ModuleKey as a type instead.",
            },
          ],
        },
      ],
    },
  },
);
