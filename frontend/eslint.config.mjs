import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      "node_modules/**",
      "**/*.min.js",
      "**/*.min.css",
    ],
  },
  ...nextVitals,
  ...nextTs,
];

export default config;
