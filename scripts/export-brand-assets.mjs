import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const jobs = [
  {
    input: path.join(root, "public", "brand", "piscrow-app-icon.svg"),
    outputs: [
      {
        file: path.join(root, "public", "brand", "piscrow-app-icon.png"),
        width: 512,
        height: 512,
      },
      {
        file: path.join(root, "public", "brand", "piscrow-app-icon-192.png"),
        width: 192,
        height: 192,
      },
      {
        file: path.join(root, "src", "app", "icon.png"),
        width: 512,
        height: 512,
      },
    ],
  },
  {
    input: path.join(root, "public", "brand", "piscrow-bot-avatar.svg"),
    outputs: [
      {
        file: path.join(root, "public", "brand", "piscrow-bot-avatar.png"),
        width: 512,
        height: 512,
      },
    ],
  },
  {
    input: path.join(root, "public", "brand", "piscrow-favicon.svg"),
    outputs: [
      {
        file: path.join(root, "public", "brand", "piscrow-favicon.png"),
        width: 64,
        height: 64,
      },
      {
        file: path.join(root, "public", "brand", "piscrow-favicon-32.png"),
        width: 32,
        height: 32,
      },
      {
        file: path.join(root, "src", "app", "favicon.png"),
        width: 64,
        height: 64,
      },
    ],
  },
  {
    input: path.join(root, "public", "brand", "piscrow-wordmark.svg"),
    outputs: [
      {
        file: path.join(root, "public", "brand", "piscrow-wordmark.png"),
        width: 860,
        height: 220,
      },
    ],
  },
  {
    input: path.join(root, "public", "brand", "piscrow-splash.svg"),
    outputs: [
      {
        file: path.join(root, "public", "brand", "piscrow-splash.png"),
        width: 1600,
        height: 900,
      },
    ],
  },
];

async function ensureDir(filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
}

async function renderAll() {
  for (const job of jobs) {
    for (const output of job.outputs) {
      await ensureDir(output.file);
      await sharp(job.input)
        .resize(output.width, output.height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(output.file);
      console.log(`wrote ${path.relative(root, output.file)}`);
    }
  }
}

renderAll().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
