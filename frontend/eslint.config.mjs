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
      "playwright-report-2client/**",
      "**/*.min.js",
      "**/*.min.css",
    ],
  },
  ...nextVitals,
  ...nextTs,
  // One shared date-filter UI for admin pages (6 copies before PR #297);
  // the design-system showcase is exempt.
  {
    files: ["app/admin/**/*.ts", "app/admin/**/*.tsx"],
    ignores: ["app/admin/design-system/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/components/ui/DateRangePicker",
          message: "Admin date filters must use the shared DatePresetFilter from '@/components/admin/DatePresetFilter' (presets in '@/lib/date-range').",
        }],
      }],
    },
  },
];

export default config;
