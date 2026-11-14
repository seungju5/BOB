import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp'; // Existing root Next.js build dependency; no runtime library.

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(workspace, '../..');
const res = path.join(workspace, 'android/app/src/main/res');
const assets = path.join(workspace, 'ios/App/App/Assets.xcassets');
const logo = path.join(repo, 'public/brand/rice-logo.png');
const bunny = path.join(repo, 'public/brand/bunny.png');
const paper = '#fffdf7'; // Approved docs/brand.css --paper, not a new palette.

// Packaging only: resize/composite the approved files; do not redraw characters.
async function icon(size, foreground = false) {
  const symbol = await sharp(logo).resize(Math.round(size * (foreground ? 0.59 : 0.8))).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4,
    background: foreground ? '#00000000' : paper } }).composite([{ input: symbol, gravity: 'centre' }]).png().toBuffer();
}
for (const [density, size, foregroundSize] of [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
]) {
  const directory = path.join(res, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  const rendered = await icon(size);
  await writeFile(path.join(directory, 'ic_launcher.png'), rendered);
  await writeFile(path.join(directory, 'ic_launcher_round.png'), rendered);
  await writeFile(path.join(directory, 'ic_launcher_foreground.png'), await icon(foregroundSize, true));
}
await writeFile(path.join(assets, 'AppIcon.appiconset/AppIcon-512@2x.png'),
  await sharp(await icon(1024)).flatten({ background: paper }).png().toBuffer());
// Eliminate every Capacitor template splash. The OS lays out the exact bunny PNG.
for (const entry of await readdir(res, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith('drawable')) {
    await rm(path.join(res, entry.name, 'splash.png'), { force: true });
  }
}
await mkdir(path.join(res, 'drawable-nodpi'), { recursive: true });
await cp(bunny, path.join(res, 'drawable-nodpi/brand_bunny.png'));
const splash = path.join(assets, 'Splash.imageset');
for (const file of await readdir(splash)) if (file.endsWith('.png')) await rm(path.join(splash, file));
await cp(bunny, path.join(splash, 'bunny.png'));
await writeFile(path.join(splash, 'Contents.json'), JSON.stringify({
  images: [{ idiom: 'universal', filename: 'bunny.png' }], info: { author: 'xcode', version: 1 },
}, null, 2) + '\n');
const sources = {};
for (const file of [logo, bunny]) sources[path.relative(repo, file)] = createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(path.join(workspace, 'brand-assets.json'), JSON.stringify({
  sources, transformation: 'Platform-required resize/padding only; original assets unchanged.',
  buildTool: `sharp ${sharp.versions.sharp}`, background: paper,
}, null, 2) + '\n');
console.log('Native icon and splash use the approved rice logo and original bunny.');
