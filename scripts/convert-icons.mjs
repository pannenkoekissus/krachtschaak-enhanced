import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, '..', 'public', 'icons');

const sizes = [48, 72, 96, 128, 192, 256, 512];

for (const size of sizes) {
    const input = path.join(iconsDir, `icon-${size}.webp`);
    const output = path.join(iconsDir, `icon-${size}.png`);
    await sharp(input).png().toFile(output);
    console.log(`Converted icon-${size}.webp -> icon-${size}.png`);
}

console.log('Done!');
