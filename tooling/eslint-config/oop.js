import tseslint from "typescript-eslint";
import { base } from "./base.js";

export default tseslint.config(...base, {
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
    "@typescript-eslint/no-extraneous-class": "off",
  },
});
