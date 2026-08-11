import organizeImports from "prettier-plugin-organize-imports";

/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  endOfLine: "lf",
  plugins: [organizeImports],
};
