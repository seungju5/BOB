import {mkdtemp, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import tess from 'tesseract.js';
import {isCookingPower} from '../cooking-signal.mjs';
import {readMeterText} from '../../../lib/smartthings/meter-screenshot.ts';

const require = createRequire(import.meta.url);
const maxBytes = 10 * 1024 * 1024;

async function captureExport(bytes) {
  const packet = JSON.parse(bytes.toString('utf8'));
  const p = packet?.power;
  if (Object.keys(packet).length !== 1 || !p || typeof p.value !== 'number' ||
      !Number.isFinite(p.value) || p.value < 0 || p.unit !== 'W' ||
      typeof p.timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(p.timestamp))
    throw Error('Invalid instantaneous power export');
  // Render only the measured attribute into memory. No account, device ID or dashboard is loaded.
  const lines = ['Power meter', String(p.value) + ' W', 'Measured at: ' + p.timestamp];
  const rows = lines.map((line,i) => '<text x="40" y="'+(70+80*i)+'">'+line+'</text>').join('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1350" height="300"><rect width="100%" height="100%" fill="white"/><g font-family="monospace" font-size="36" fill="black">'+rows+'</g></svg>';
  return {image:await sharp(Buffer.from(svg)).png().toBuffer(), original:{measuredAt:Date.parse(p.timestamp), cooking:isCookingPower(p.value)}};
}

/** The operator binds one owner-authorized export/image to one recipient before processing it. */
export async function readCapture(bytes, grant, now = Date.now()) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes ||
      createHash('sha256').update(bytes).digest('hex') !== grant.sourceSha256)
    throw Error('Source does not match the approved file');
  let image = bytes, original;
  if (grant.format === 'power-export') {
    ({image, original} = await captureExport(bytes));
  } else if (grant.format !== 'screenshot') throw Error('Unsupported source format');

  const decoder = sharp(image,{limitInputPixels:20_000_000,failOn:'warning'});
  const meta = await decoder.metadata();
  if (!['png','jpeg','webp'].includes(meta.format) || !meta.width || !meta.height || (meta.pages ?? 1) !== 1)
    throw Error('Expected one meter image');
  // Only links to the installed, pinned language models live here. No image or OCR text is written to disk.
  const langPath = await mkdtemp(join(tmpdir(),'warming-meter-language-'));
  let worker, closed = false, timer, fail;
  const interruption = new Promise((_, reject) => { fail = reject; });
  const recognize = async () => {
    const codes = ['eng','kor'];
    await Promise.all(codes.map(code => symlink(
      require.resolve('@tesseract.js-data/'+code+'/4.0.0_best_int/'+code+'.traineddata.gz'),
      join(langPath,code+'.traineddata.gz'))));
    const reader = await tess.createWorker(codes,tess.OEM.LSTM_ONLY,{langPath,cacheMethod:'none',
      errorHandler:() => fail(Error('Could not recognize the meter image'))});
    if (closed) { await reader.terminate(); throw Error('Recognition expired'); }
    worker = reader;
    await reader.setParameters({tessedit_pageseg_mode:tess.PSM.SINGLE_BLOCK});
    const input = await decoder.rotate().flatten({background:'#ffffff'}).resize({width:Math.min(meta.width*1.6,2400) | 0}).png().toBuffer();
    const result = await reader.recognize(input);
    const parsed = readMeterText(result.data.text,now);
    // An average, phone clock, ambiguous OCR or unlabelled date cannot enter a household record.
    if (!parsed || parsed.measuredAt === null || parsed.measuredAt !== Date.parse(grant.measuredAt) ||
        parsed.cooking !== grant.cooking ||
        (original && (original.cooking !== parsed.cooking || original.measuredAt !== parsed.measuredAt)))
      throw Error('The measurement time or threshold did not match the confirmed source');
    return parsed;
  };
  try {
    return await Promise.race([recognize(),interruption,new Promise((_, reject) => {
      timer = setTimeout(()=>reject(Error('Recognition expired')),90_000);
    })]);
  } finally {
    closed = true;
    clearTimeout(timer);
    if (worker) await worker.terminate();
    await rm(langPath,{recursive:true,force:true});
  }
}
