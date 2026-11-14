import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {EDITIONS} from '../docs/editions.mjs';
const source=await readFile(new URL('../docs/index.html',import.meta.url),'utf8');
for(const [edition,details] of Object.entries(EDITIONS)){
  const directory=new URL(`../docs/${edition}/`,import.meta.url);
  await mkdir(directory,{recursive:true});
  const html=source.replace('<head>',`<head>\n  <base href="../">\n  <meta name="bapmunna-edition" content="${edition}">`)
    .replaceAll('https://impact-series.web.app/bapmunna"',`https://impact-series.web.app/bapmunna/${edition}"`)
    .replace(/<title>[^<]*<\/title>/,`<title>밥뭇나 ${details.label} · ${details.english}</title>`)
    .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${details.title}. ${edition==='senior'?'큰 버튼으로 식사를 확인하고 내 기록을 보관하세요.':'식사 요약·알림 기준·가족 공유를 둘러보세요. 가족 연동은 현재 체험입니다.'}">`)
    .replace('<body data-view="welcome">',`<body data-view="${details.home}" data-edition="${edition}">`);
  await writeFile(new URL('index.html',directory),html);
  if(edition==='carer'){
    // A fresh share URL serves the same app, without a redirect or a separate session.
    const share=new URL('../docs/share/',import.meta.url);
    await mkdir(share,{recursive:true});
    await writeFile(new URL('index.html',share),html.replaceAll('https://impact-series.web.app/bapmunna/carer"','https://impact-series.web.app/bapmunna/share"'));
  }
}
console.log('Built Senior, Carer and logo-sharing entry pages from the shared application shell.');
