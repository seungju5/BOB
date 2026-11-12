// Local-only account UI checks. No Firebase or Supabase connection is created.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../docs'),port=5209;
const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf'};
createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');
  const fixture=url.pathname==='/cloud-api.mjs';
  let file=fixture?path.resolve(import.meta.dirname,'../tests/fixtures/edition-accounts.mjs'):path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!fixture&&file!==root&&!file.startsWith(root+path.sep))throw Error('Not found');
  if((await stat(file)).isDirectory())file=path.join(file,'index.html');
  let content=await readFile(file);
  if(path.extname(file)==='.html')content=Buffer.from(content.toString().replace('<main id="main"','<aside style="padding:10px;background:#fbe6a3;text-align:center;font-size:13px">로컬 검사 · 로그인과 모든 기록은 가상입니다. <span id="fixture-audit"></span></aside><main id="main"'));
  res.writeHead(200,{'Content-Type':`${types[path.extname(file)]||'text/plain'};charset=utf-8`,'Cache-Control':'no-store'}).end(content);
}catch{res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Account edition fixture http://127.0.0.1:${port}/carer/#account`));
