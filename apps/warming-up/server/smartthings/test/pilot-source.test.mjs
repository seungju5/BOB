import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readCapture} from '../pilot/read-capture.mjs';
const measuredAt='2026-01-03T22:12:34.000Z';
const source=Buffer.from(JSON.stringify({power:{value:700,unit:'W',timestamp:measuredAt}}));
const grant={format:'power-export',sourceSha256:createHash('sha256').update(source).digest('hex'),measuredAt,cooking:true};
test('renders a consented power export privately and verifies the measured time and threshold through offline OCR',async()=>{
  assert.deepEqual(await readCapture(source,grant,Date.parse(measuredAt)+1000),{measuredAt:Date.parse(measuredAt),cooking:true});
  await assert.rejects(readCapture(source,{...grant,sourceSha256:'other'}),/approved file/);
  await assert.rejects(readCapture(source,{...grant,cooking:false}),/did not match/);
});
