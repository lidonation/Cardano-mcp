#!/usr/bin/env tsx
import sharp from "sharp";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const BRAND = join(process.cwd(), "public", "brand");
const OUT   = join(process.cwd(), "public");

async function main() {
  // Always rasterize from the hex-fallback static mark — animated SVGs don't rasterize faithfully
  const staticSvg = await fs.readFile(join(BRAND, "mark-static-hex.svg"));

  const sizes = [16, 32, 48, 180, 192, 512];
  for (const s of sizes) {
    const file = join(OUT, `icon-${s}.png`);
    await sharp(staticSvg, { density: 384 }).resize(s, s).png().toFile(file);
    console.log(`[brand] ${file}`);
  }

  // OG card 1200×630
  const og = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="g1" cx="30%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#3aa6e8" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#3aa6e8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0f1827"/>
  <rect width="1200" height="630" fill="url(#g1)"/>
  <text x="64" y="320" font-family="ui-sans-serif, system-ui" font-weight="600" font-size="64" fill="#f6f8fb">A Model Context Protocol server</text>
  <text x="64" y="396" font-family="ui-sans-serif, system-ui" font-weight="600" font-size="64" fill="#3aa6e8">for the Cardano ledger.</text>
  <text x="64" y="560" font-family="ui-monospace, Menlo, monospace" font-size="22" fill="#9aa6b8">github.com/lidonation/Cardano-mcp</text>
</svg>`);

  await sharp(og)
    .composite([{ input: staticSvg, top: 64, left: 64 }])
    .png()
    .toFile(join(OUT, "og-card.png"));
  console.log("[brand] og-card.png");

  // Avatar 512×512
  await sharp(staticSvg, { density: 384 })
    .resize(512, 512)
    .png()
    .toFile(join(BRAND, "avatar-512.png"));
  console.log("[brand] brand/avatar-512.png");

  console.log("✓ brand assets regenerated");
}

main().catch(e => { console.error(e); process.exit(1); });
