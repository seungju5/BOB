// Serve the pinned browser worker, LSTM cores, and language models from team Hosting.
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'worker.min.js.LICENSE.txt': 'tesseract.js/dist/worker.min.js.LICENSE.txt',
  'LICENSE.txt': 'tesseract.js/LICENSE.md',
  'core-LICENSE.txt': 'tesseract.js-core/LICENSE',
};
for (const variant of ['', '-simd', '-relaxedsimd']) {
  const name = 'tesseract-core' + variant + '-lstm.wasm.js';
  files[name] = 'tesseract.js-core/' + name;
}
for (const lang of ['eng', 'kor']) {
  const name = lang + '.traineddata.gz';
  files[name] = '@tesseract.js-data/' + lang + '/4.0.0_best_int/' + name;
}

export const meterOcrAssets = new Map(Object.entries(files).map(([name, source]) =>
  ['meter-ocr/' + name, join(root, 'node_modules', source)]));

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await mkdir(join(root, 'public/meter-ocr'), { recursive: true });
  for (const [path, source] of meterOcrAssets) await copyFile(source, join(root, 'public', path));
}
