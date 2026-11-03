// Inlines api/shubham.md into api/_profile.ts.
//
// The chat endpoint runs on Vercel's edge runtime, which has no filesystem —
// so the profile has to be part of the bundle. Keeping the human-editable copy
// in Markdown and generating the .ts means there is still exactly one file to
// edit. Runs automatically on `npm run build` and on `npm run dev`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "api", "shubham.md");
const target = join(root, "api", "_profile.ts");

// HTML comments are editing notes for Shubham, not context for the model.
const markdown = readFileSync(source, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim();

const contents = `// GENERATED FILE — do not edit by hand.
// Source: api/shubham.md · regenerate with: npm run profile

export const PROFILE = ${JSON.stringify(markdown)};
`;

// Only write when it actually changed, so dev-server restarts stay quiet.
let previous = "";
try {
  previous = readFileSync(target, "utf8");
} catch {
  /* first run */
}
if (previous !== contents) {
  writeFileSync(target, contents);
  console.log("[gen-profile] api/_profile.ts updated from api/shubham.md");
}
