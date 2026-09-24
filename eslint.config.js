// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions is Deno code, checked with `npm run check:functions`.
    ignores: ["dist/*", "supabase/functions/**"],
  },
  // Server-only secrets must never reach the app. (Expo only bundles EXPO_PUBLIC_*
  // variables anyway; this rule stops the mistake before it is written.)
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/SECRET|SERVICE_ROLE/]",
          message: "Server-only secret: never use it in app code (see CLAUDE.md §11).",
        },
        {
          selector: "Literal[value=/sb_secret_|service_role/]",
          message: "Server-only secret: never use it in app code (see CLAUDE.md §11).",
        },
      ],
    },
  },
]);
