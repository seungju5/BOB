import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function syncPublicConfig(root){
 let source;try{source=await readFile(path.join(root,'.env.local'),'utf8');}catch(error){if(error.code==='ENOENT')return;throw error;}
 const values={};for(const line of source.split(/\r?\n/)){
  const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);if(!match)continue;
  let value=match[2];if(value.startsWith('"'))value=JSON.parse(value);else if(value.startsWith("'")&&value.endsWith("'"))value=value.slice(1,-1);
  values[match[1]]=value;
 }
 const url=values.NEXT_PUBLIC_SUPABASE_URL,key=values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(url||key){
  if(new URL(url).hostname!=='dakozsbqltciqihazzel.supabase.co')throw Error('Environment Supabase target does not match the confirmed project.');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key||''))throw Error('Only a Supabase publishable key may enter the browser bundle.');
  const config={configured:true,emailDeliveryLimited:values.SUPABASE_EMAIL_DELIVERY_LIMITED!=='false',url,publishableKey:key};
  await writeFile(path.join(root,'docs/supabase-config.mjs'),'// Publishable browser configuration. No administrator credential.\nexport const supabaseConfig='+JSON.stringify(config,null,2)+';\n');
 }
}
