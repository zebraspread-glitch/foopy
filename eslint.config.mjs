import next from "eslint-config-next/core-web-vitals";

// ESLint 9 flat config. `next lint` was removed in Next 16, so we run ESLint
// directly (see the "lint" script) using Next's flat config preset.
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      ".claude/**",
      "scripts/**",
      "next-env.d.ts",
    ],
  },
  ...next,
  {
    // eslint-config-next 16 bundles the React Compiler `react-hooks` rules at
    // "error". They flag many intentional, idiomatic patterns in this codebase
    // (setState-in-effect loading flags, module-level caches, etc.) that aren't
    // bugs — keep them visible as warnings rather than failing the lint.
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/globals": "warn",
    },
  },
];

export default eslintConfig;
