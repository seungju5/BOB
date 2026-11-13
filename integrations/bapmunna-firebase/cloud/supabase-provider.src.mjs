import {createClient} from '@supabase/supabase-js';
import {CONSENT_VERSION,koreanDay,checkDisplayName,checkMeal,STAGES} from './auth-utils.mjs';
import {createSessionStorage} from './session-storage.mjs';
export function createProvider(config){
  let currentUser=null,mealWatch=null,identityEpoch=0;
  const sessionKey='bapmunna-supabase-session';
  const persistence=createSessionStorage(localStorage,sessionStorage,sessionKey),storage=persistence.storage;
  const client=createClient(config.url,config.publishableKey,{auth:{storage,storageKey:sessionKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  const result=async operation=>{const response=await operation;if(response.error)throw response.error;return response.data;};
  const mapUser=user=>user?{uid:user.id,email:user.email||'',displayName:user.user_metadata?.display_name||'',verified:!!user.email_confirmed_at}:null;
  const owner=()=>{if(!currentUser?.email_confirmed_at)throw Error('이메일을 확인한 계정으로 로그인해 주세요.');return currentUser;};
  const normalize=row=>({ownerUid:row.owner_uid,email:row.email,displayName:row.display_name,consentVersion:row.consent_version,createdAt:row.created_at,updatedAt:row.updated_at,lastLoginAt:row.last_login_at});
  const appBase=new URL('../',import.meta.url);
  const returnURL=()=>new URL('?flow=account#account',appBase).href;
  function acceptUser(user){
    if(currentUser?.id!==user?.id||!!currentUser?.email_confirmed_at!==!!user?.email_confirmed_at){
      identityEpoch++;mealWatch?.stop();
    }
    currentUser=user;
  }
  const currentWatch=watch=>!!watch&&watch.active&&mealWatch===watch&&watch.epoch===identityEpoch&&currentUser?.id===watch.uid&&!!currentUser.email_confirmed_at;
  async function loadMeals(watch){
    if(!currentWatch(watch))return;
    const request=++watch.request;
    try{
      const rows=await result(client.from('bapmunna_meals').select('owner_uid,day,meal,kind,created_at,updated_at').eq('owner_uid',watch.uid).order('day',{ascending:false}).limit(90));
      if(currentWatch(watch)&&request===watch.request)watch.callback(rows.map(row=>({id:`${row.day}_${row.meal}`,ownerUid:row.owner_uid,day:row.day,meal:row.meal,kind:row.kind,createdAt:row.created_at,updatedAt:row.updated_at})));
    }catch(error){if(currentWatch(watch)&&request===watch.request)throw error;}
  }
  return {
    name:'Supabase',supportsGoogle:config.oauthProviders?.google===true,supportsKakao:config.oauthProviders?.kakao===true,signupNotice:config.emailDeliveryLimited?'확인 메일은 현재 프로젝트 팀의 이메일에만 발송돼요. 누구나 회원가입하려면 Firebase 버전을 이용해 주세요.':null,
    async google(remember){persistence.remember(remember);await result(client.auth.signInWithOAuth({provider:'google',options:{redirectTo:returnURL()}}));},
    async kakao(remember){persistence.remember(remember);await result(client.auth.signInWithOAuth({provider:'kakao',options:{redirectTo:returnURL()}}));},
    onUser(callback){
      let active=true,receivedEvent=false;
      const notify=(user,meta={})=>{const epoch=identityEpoch;setTimeout(()=>{if(active&&epoch===identityEpoch)callback(mapUser(user),meta);},0);};
      const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{if(!active)return;receivedEvent=true;acceptUser(session?.user||null);notify(currentUser,{recovery:event==='PASSWORD_RECOVERY'});});
      client.auth.getSession().then(({data})=>{if(active&&!receivedEvent){acceptUser(data.session?.user||null);notify(currentUser);}});
      return ()=>{active=false;subscription.unsubscribe();};
    },
    async signIn(email,password,remember){persistence.remember(remember);await result(client.auth.signInWithPassword({email:email.trim(),password}));},
    async signUp(email,password,name,remember){persistence.remember(remember);if(password.length<8)throw Object.assign(Error(),{code:'weak_password'});await result(client.auth.signUp({email:email.trim(),password,options:{data:{display_name:checkDisplayName(name)},emailRedirectTo:returnURL()}}));},
    async resetPassword(email){await result(client.auth.resetPasswordForEmail(email.trim(),{redirectTo:new URL('?flow=recovery#account',appBase).href}));},
    async changePassword(password){if(password.length<8)throw Object.assign(Error(),{code:'weak_password'});await result(client.auth.updateUser({password}));},
    async resendVerification(email){const target=currentUser?.email||String(email||'').trim();if(target)await result(client.auth.resend({type:'signup',email:target,options:{emailRedirectTo:returnURL()}}));},
    async refreshUser(){const epoch=identityEpoch,session=await result(client.auth.getSession());if(epoch!==identityEpoch)return mapUser(currentUser);if(!session.session){acceptUser(null);return null;}const data=await result(client.auth.getUser());if(epoch===identityEpoch)acceptUser(data.user);return mapUser(currentUser);},
    async signOut(){const epoch=identityEpoch;await result(client.auth.signOut());if(epoch===identityEpoch)acceptUser(null);if(!currentUser)persistence.clearPreference();},
    async getProfile(){const user=owner(),data=await result(client.from('bapmunna_accounts').select('*').eq('owner_uid',user.id).maybeSingle());return data?normalize(data):null;},
    async saveProfile(name){const user=owner();await result(client.from('bapmunna_accounts').upsert({owner_uid:user.id,email:user.email,display_name:checkDisplayName(name),consent_version:CONSENT_VERSION},{onConflict:'owner_uid'}));},
    async touchLogin(){owner();await result(client.rpc('bapmunna_touch_login'));},
    watchMeals(callback,onError){
      const user=owner();mealWatch?.stop();
      const watch={uid:user.id,epoch:identityEpoch,active:true,request:0,callback,stop:null};
      const refresh=()=>loadMeals(watch).catch(error=>{if(currentWatch(watch))onError?.(error);});
      watch.stop=()=>{watch.active=false;if(mealWatch===watch)mealWatch=null;window.removeEventListener('focus',refresh);};
      mealWatch=watch;window.addEventListener('focus',refresh);void refresh();return watch.stop;
    },
    async saveMeal(slot,kind){const user=owner(),watch=mealWatch;checkMeal(slot,kind);await result(client.from('bapmunna_meals').upsert({owner_uid:user.id,day:koreanDay(),meal:slot,kind},{onConflict:'owner_uid,day,meal'}));await loadMeals(watch);},
    async removeMeal(id){const user=owner(),watch=mealWatch;if(!/^\d{4}-\d{2}-\d{2}_(breakfast|lunch|dinner)$/.test(id))throw Error('기록을 확인해 주세요.');const [day,slot]=id.split('_');await result(client.from('bapmunna_meals').delete().eq('owner_uid',user.id).eq('day',day).eq('meal',slot));await loadMeals(watch);},
    async isStaff(){owner();return !!await result(client.rpc('bapmunna_is_staff'));},
    async listCustomers({cursor=null}={}){
      owner();let request=client.from('bapmunna_crm_contacts').select('*').order('created_at',{ascending:false}).order('owner_uid',{ascending:false}).limit(51);
      if(cursor)request=request.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},owner_uid.lt.${cursor.id})`);
      const response=await result(request),rows=response.slice(0,50);
      const notes=rows.length?await result(client.from('bapmunna_crm_notes').select('owner_uid,stage,note,updated_at').in('owner_uid',rows.map(row=>row.owner_uid))):[];
      const last=rows.at(-1);
      return {customers:rows.map(row=>{const note=notes.find(note=>note.owner_uid===row.owner_uid);return {id:row.owner_uid,...normalize(row),stage:note?.stage||'new',note:note?.note||'',noteUpdatedAt:note?.updated_at||null};}),hasMore:response.length>50,nextCursor:last?{createdAt:last.created_at,id:last.owner_uid}:null};
    },
    async saveCustomerNote(uid,stage,note){const user=owner();if(!Object.hasOwn(STAGES,stage)||String(note).length>1000)throw Error('운영 단계와 1,000자 이내 메모를 확인해 주세요.');const saved=await result(client.from('bapmunna_crm_notes').upsert({owner_uid:uid,stage,note:String(note).trim(),updated_by:user.id},{onConflict:'owner_uid'}).select('stage,note,updated_at').single());return {stage:saved.stage,note:saved.note,noteUpdatedAt:saved.updated_at};},
  };
}
