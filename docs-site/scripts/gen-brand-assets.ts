#!/usr/bin/env tsx
import sharp from "sharp";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "public", "brand");
const OUT  = join(process.cwd(), "public");
const DOCS = join(process.cwd(), "..", "docs", "assets");

async function rasterize(src: string, sizes: number[], prefix: string, outDir = OUT) {
  const svg = await fs.readFile(join(ROOT, src));
  for (const s of sizes) {
    const png = await sharp(svg, { density: 384 }).resize(s, s).png().toBuffer();
    const file = join(outDir, `${prefix}-${s}.png`);
    await fs.writeFile(file, png);
    console.log(`[brand] ${file}`);
  }
}

async function main() {
  await fs.mkdir(DOCS, { recursive: true });

  // Favicons from solid silhouette (reads cleanly at 16px)
  await rasterize("mark-solid.svg", [16, 32, 48, 64, 180, 192, 512], "favicon");
  await fs.copyFile(join(OUT, "favicon-32.png"), join(OUT, "favicon.ico"));
  await fs.copyFile(join(OUT, "favicon-180.png"), join(OUT, "apple-touch-icon.png"));
  console.log("[brand] favicon.ico + apple-touch-icon.png");

  // OG image (1200×630 — not square so rasterize manually)
  const og = await fs.readFile(join(ROOT, "og-1200x630.svg"));
  await sharp(og, { density: 384 }).resize(1200, 630).png()
    .toFile(join(OUT, "og.png"));
  console.log("[brand] og.png");

  // README banner
  const banner = await fs.readFile(join(ROOT, "readme-banner.svg"));
  await sharp(banner, { density: 384 }).resize(1280, 320).png()
    .toFile(join(DOCS, "banner.png"));
  console.log("[brand] docs/assets/banner.png");

  // Avatar (512×512 for GitHub/Discord)
  const avatar = await fs.readFile(join(ROOT, "mark-solid.svg"));
  await sharp(avatar, { density: 384 }).resize(512, 512).png()
    .toFile(join(ROOT, "avatar-512.png"));
  console.log("[brand] brand/avatar-512.png");
}

main().catch(e => { console.error(e); process.exit(1); });
