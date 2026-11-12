import {cloudConfig} from './cloud-config.mjs';
export async function connectCloud(){
  if(location.protocol==='file:')throw Error('내려받는 단일 파일은 체험용이에요. 실제 로그인과 저장은 공개 웹앱에서 이용해 주세요.');
  if(cloudConfig.provider==='supabase'){
    const {supabaseConfig}=await import('./supabase-config.mjs');
    if(!supabaseConfig.configured||!supabaseConfig.publishableKey)throw Error('Supabase 연결을 준비 중이에요. 현재는 Firebase 버전에서 실제 로그인과 저장을 이용해 주세요.');
    const {createProvider}=await import('./cloud/supabase-provider.mjs');return createProvider(supabaseConfig);
  }
  const {firebaseConfig}=await import('./firebase-config.mjs');
  const {createProvider}=await import('./cloud/firebase-provider.mjs');return createProvider(firebaseConfig);
}
