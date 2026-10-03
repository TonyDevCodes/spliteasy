import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const svg = await readFile(path.join(root, "scripts/brand/logo-mark.svg"));
const out = (name) => path.join(root, "mobile/assets", name);

// Render the mark at a given size (density keeps the vector crisp).
const mark = (size) =>
  sharp(svg, { density: Math.ceil((72 * size) / 140) * 2 })
    .resize(size, size)
    .png()
    .toBuffer();

async function onCanvas(canvas, markSize, background, file) {
  const buf = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background },
  })
    .composite([{ input: await mark(markSize), gravity: "center" }])
    .png()
    .toBuffer();
  await writeFile(out(file), buf);
}

await writeFile(out("logo-mark.png"), await mark(512));
await onCanvas(1024, Math.round(1024 * 0.7), "#F7F9FD", "icon.png");
await onCanvas(1024, Math.round(1024 * 0.6), { r: 0, g: 0, b: 0, alpha: 0 }, "adaptive-icon.png");
console.log("Generated logo-mark.png, icon.png, adaptive-icon.png");
