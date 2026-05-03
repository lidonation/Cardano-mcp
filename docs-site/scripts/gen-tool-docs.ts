#!/usr/bin/env tsx
/**
 * Generates per-tool MDX pages and keeps tools.generated.json in sync.
 * Run: tsx scripts/gen-tool-docs.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataFile = path.join(root, "data", "tools.generated.json");
const pagesDir = path.join(root, "pages", "tools");

interface Tool {
  name: string;
  module: string;
  description: string;
  upstream: string[];
}

const tools: Tool[] = JSON.parse(fs.readFileSync(dataFile, "utf8"));

const modules = Array.from(new Set(tools.map((t) => t.module)));

// Ensure module subdirs exist
for (const mod of modules) {
  fs.mkdirSync(path.join(pagesDir, mod), { recursive: true });
}

// Write per-module _meta.ts
for (const mod of modules) {
  const modTools = tools.filter((t) => t.module === mod);
  const entries = modTools
    .map((t) => `  ${t.name}: "${t.name.replace(/_/g, " ")}"`)
    .join(",\n");
  fs.writeFileSync(
    path.join(pagesDir, mod, "_meta.ts"),
    `export default {\n${entries},\n};\n`
  );
}

// Write per-tool MDX files
let created = 0;
let skipped = 0;

for (const tool of tools) {
  const mdxPath = path.join(pagesDir, tool.module, `${tool.name}.mdx`);
  if (fs.existsSync(mdxPath)) {
    skipped++;
    continue;
  }

  const upstreamBadges = tool.upstream
    .map((u) => `<span className="badge">${u}</span>`)
    .join(" ");

  const content = `import { Callout } from "@/components/Callout";
import { KV } from "@/components/KV";

# \`${tool.name}\`

<div className="tool-header-meta">
  <span className="chip module-${tool.module}">${tool.module}</span>
  ${upstreamBadges}
</div>

${tool.description}

## Input schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| — | — | — | *See source: \`src/modules/${tool.module}/index.ts\`* |

## Returns

\`\`\`json
{
  "content": [{ "type": "text", "text": "..." }]
}
\`\`\`

## Example

\`\`\`
Use the ${tool.name} tool to ...
\`\`\`

<Callout type="info">
  All tool responses return structured JSON. Claude can parse and reason about the result directly.
</Callout>
`;

  fs.writeFileSync(mdxPath, content);
  created++;
}

// Write top-level tools/_meta.ts with module subfolders
const moduleEntries = modules
  .map((m) => `  ${m}: "${m.charAt(0).toUpperCase() + m.slice(1)}"`)
  .join(",\n");
fs.writeFileSync(
  path.join(pagesDir, "_meta.ts"),
  `export default {\n  index: "All Tools",\n${moduleEntries},\n};\n`
);

console.log(`✓ gen-tool-docs: created ${created} MDX files, skipped ${skipped} existing`);
