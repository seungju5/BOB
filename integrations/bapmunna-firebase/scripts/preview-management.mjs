// Local-only visual QA. Synthetic fixtures cannot be published by the staging script.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../docs'),port=5207;
const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/__preview'){
  let html=await readFile(path.join(root,'manage/index.html'),'utf8');
  html=html.replace('<head>','<head><base href="/manage/">').replace('data-manager-state="guest"','data-manager-state="ready"').replace('src="./crm.mjs"','src="/__fixture.mjs"').replace('<main id="main">','<div style="background:#fff2c7;text-align:center;padding:8px 16px;font-size:11px;color:#715b30">디자인 검증용 미리보기 · 모든 수치와 회원은 가상 데이터입니다.</div><main id="main">');
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}).end(html);return;
 }
 let file=url.pathname==='/__fixture.mjs'?path.resolve(import.meta.dirname,'../tests/fixtures/management.mjs'):path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(url.pathname!=='/__fixture.mjs'&&file!==root&&!file.startsWith(root+path.sep))throw Error('Not found');
 if((await stat(file)).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'Content-Type':`${types[path.extname(file)]||'text/plain'};charset=utf-8`,'Cache-Control':'no-store'}).end(await readFile(file));
 }catch{res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Management preview http://127.0.0.1:${port}/__preview`));
