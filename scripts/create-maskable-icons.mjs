import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, '..', 'public', 'icons');

// Create maskable icons with 20% safe zone padding (as recommended by Google)
const sizes = [192, 512];

for (const size of sizes) {
    const input = path.join(iconsDir, `icon-${size}.png`);
    const output = path.join(iconsDir, `icon-${size}-maskable.png`);
    const padding = Math.round(size * 0.1); // 10% padding on each side = 20% total safe zone
    const innerSize = size - (padding * 2);
    
    const resized = await sharp(input)
        .resize(innerSize, innerSize)
        .toBuffer();
    
    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 17, g: 24, b: 39, alpha: 1 } // #111827 bg
        }
    })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(output);
    
    console.log(`Created maskable icon: icon-${size}-maskable.png`);
}

console.log('Done!');
