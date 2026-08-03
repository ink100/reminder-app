import { createConfigForNuxt } from "@nuxt/eslint-config/flat";

export default createConfigForNuxt({
  features: {
    tooling: true,
    stylistic: false,
  },
}).append({
  ignores: [".nuxt/**", ".output/**", ".next/**", "build/**", "release/**", "coverage/**"],
  rules: {
    "@typescript-eslint/consistent-type-imports": "off",
    "@typescript-eslint/no-import-type-side-effects": "off",
    "@typescript-eslint/no-invalid-void-type": "off",
    "import/no-duplicates": "off",
    "no-control-regex": "off",
    "no-useless-assignment": "off",
    "no-useless-escape": "off",
    "preserve-caught-error": "off",
    "regexp/no-super-linear-backtracking": "off",
    "regexp/no-unused-capturing-group": "off",
    "regexp/no-useless-escape": "off",
    "regexp/no-useless-non-capturing-group": "off",
    "regexp/optimal-quantifier-concatenation": "off",
    "regexp/prefer-w": "off",
    "regexp/strict": "off",
    "regexp/use-ignore-case": "off",
    "unicorn/escape-case": "off",
    "unicorn/number-literal-case": "off",
    "unicorn/prefer-node-protocol": "off",
    "unicorn/prefer-number-properties": "off",
    "unicorn/prefer-type-error": "off",
  },
}, {
  files: ["tests/**/*.ts", "scripts/**/*.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "import/first": "off",
  },
});
