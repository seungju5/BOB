import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {editionFromLocation,editionView,initialEditionView,editionLink} from '../docs/editions.mjs';
const at=path=>new URL(path,'https://first.example');
test('separate URLs open their own home, with or without trailing slash',()=>{
  for(const base of ['/bapmunna/','/bapmunna/supabase/'])for(const edition of ['senior','carer'])for(const tail of ['', '/', '/index.html']){
    const url=at(base+edition+tail);assert.equal(editionFromLocation(url),edition);
    assert.equal(initialEditionView(url,edition),edition==='senior'?'senior':'guardian');
  }
});
test('deep links keep the selected edition and its navigation',()=>{
  for(const role of ['senior','carer'])for(const view of ['report','account','more','about','privacy']){
    const url=at(`/bapmunna/${role}/#${view}`);assert.equal(editionFromLocation(url),role);assert.equal(initialEditionView(url,role),view);
  }
  assert.equal(editionView('senior','settings'),'privacy');assert.equal(editionView('senior','family'),'privacy');
  assert.equal(editionView('senior','guardian'),'senior');assert.equal(editionView('carer','senior'),'guardian');
});
test('shared app links stay in Carer after login, reload and a remembered Senior visit',()=>{
  for(const base of ['/bapmunna/','/bapmunna/supabase/'])for(const tail of ['', '/', '/index.html']){
    for(const fragment of ['', '#account', '#tutorial', '#guardian'])for(const remembered of [null,'senior','carer']){
      const url=at(base+'share'+tail+fragment);
      const edition=editionFromLocation(url,'carer',remembered);
      assert.equal(edition,'carer');
      assert.equal(initialEditionView(url,edition),fragment.slice(1)||'guardian');
    }
  }
  assert.equal(editionFromLocation(at('/bapmunna/not-share/')),null);
});
test('legacy links, chooser and unknown paths have safe defaults',()=>{
  assert.equal(editionFromLocation(at('/bapmunna/')),null);
  assert.equal(editionFromLocation(at('/bapmunna/#senior')),'senior');
  assert.equal(editionFromLocation(at('/bapmunna/#guardian')),'carer');
  assert.equal(editionFromLocation(at('/bapmunna/#welcome'),'carer'),null);
  assert.equal(editionView('senior','bad'),'senior');assert.equal(editionView('carer','bad'),'guardian');
  assert.equal(editionFromLocation(at('/bapmunna/not-carer/')),null);
});
test('provider-specific links never cross databases or copy callback secrets',()=>{
  for(const base of ['https://first.example/bapmunna/','https://first.example/bapmunna/supabase/','https://second.example/bapmunna/','https://second.example/bapmunna/supabase/']){
    assert.equal(editionLink(base,'senior'),base+'senior/');
    assert.equal(editionLink(base,'carer','account'),base+'carer/#account');
    assert.equal(editionLink(base,null),base);
  }
});
test('public edition switcher is in every app header, outside account authentication',async()=>{
  for(const entry of ['index.html','senior/index.html','carer/index.html']){
    const html=await readFile(new URL(`../docs/${entry}`,import.meta.url),'utf8');
    const header=html.match(/<header[\s\S]*?<\/header>/)?.[0]||'';
    assert.match(header,/<nav id="edition-switcher" class="edition-switcher" aria-label="사용 화면 전환"><\/nav>/);
    assert.doesNotMatch(header,/data-cloud-surface|demo-tag/);
  }
});
test('switching changes presentation without clearing demo data or changing account access',async()=>{
  const app=await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8');
  const switching=app.match(/function switchEdition\(next\)\{([\s\S]*?)\n\}/)?.[1]||'';
  assert.match(switching,/if\(next===edition\|\|next!==null&&!Object\.hasOwn\(EDITIONS,next\)\)return/);
  assert.match(switching,/history\.pushState/);
  assert.doesNotMatch(switching,/state\s*=|createState|demoState|localStorage|signOut|setConsent|fetch\(|updateProfile/);
  assert.match(app,/id===edition\?' aria-current="true"'/);
});
test('existing verification and recovery callbacks still open the account surface',()=>{
  for(const query of ['?code=test-code','?flow=recovery','?flow=account']){
    const url=at('/bapmunna/supabase/'+query);const role=editionFromLocation(url);
    assert.equal(role,'senior');assert.equal(initialEditionView(url,role),'account');
  }
  assert.equal(editionFromLocation(at('/bapmunna/?flow=account#account'),'','carer'),'carer');
  assert.equal(editionFromLocation(at('/bapmunna/senior/#account'),'','carer'),'senior');
  assert.equal(editionFromLocation(at('/bapmunna/#account'),'','untrusted'),'senior');
  assert.equal(editionFromLocation(at('/bapmunna/'),'','carer'),null);
});
test('portable history preserves Senior and Carer on records and settings',()=>{
  for(const edition of ['senior','carer'])for(const view of ['report','more','account']){
    const url=at(`/bapmunna.html#${edition}/${view}`);assert.equal(editionFromLocation(url),edition);assert.equal(initialEditionView(url,edition),view);
  }
});
test('generated entry pages use shared code and explicit role metadata',async()=>{
  for(const role of ['senior','carer']){
    const html=await readFile(new URL(`../docs/${role}/index.html`,import.meta.url),'utf8');
    assert.match(html,new RegExp(`name="bapmunna-edition" content="${role}"`));
    assert.match(html,/<base href="\.\.\/">/);assert.match(html,/src="\.\/app.mjs"/);assert.match(html,/href="\.\/editions.css"/);
  }
});
