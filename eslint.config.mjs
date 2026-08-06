import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated artifacts (dedicated worker bundle).
    "dist/**",
    // QA diagnostic tooling (throwaway scripts and browser harnesses) is not
    // part of the application and is excluded from the lint gate.
    "QA/**",
  ]),
]);

export default eslintConfig;
