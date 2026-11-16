import {createRuntime} from '../../runtime/index.mjs';
import {createNodeHandler,sendUnavailable} from '../../runtime/http-adapter.mjs';
import {equal} from '../../runtime/security.mjs';
import {createKakaoRuntime} from '../../runtime/kakao-runtime.mjs';

const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});

export function createVercelHandler({env=process.env,runtimeFactory=createRuntime,kakaoFactory=createKakaoRuntime}={}){
  let handler;
  return async(req,res)=>{
    try{
      if(env.VERCEL&&env.NODEJS_HELPERS!=='0')throw Error('Raw body helpers configuration required.');
      if(!handler){
        const runtime=runtimeFactory(env);
        handler=createNodeHandler({origin:runtime.config.origin,handle:async request=>{
          const url=new URL(request.url);
          if(url.pathname!=='/api/smartthings/cleanup')return runtime.handle(request);
          if(request.method!=='GET')return reply({error:'method_not_allowed'},405,{Allow:'GET'});
          const secret=env.CRON_SECRET;
          if(typeof secret!=='string'||!/^[\x21-\x7e]{32,256}$/.test(secret))return reply({error:'cleanup_not_configured'},503);
          if(!equal(request.headers.get('authorization')||'',`Bearer ${secret}`))return reply({error:'unauthorized'},401);
          const kakao=kakaoFactory(env);
          if((!runtime.ready||!runtime.store)&&(!kakao.ready||!kakao.store))return reply({error:'setup_required'},503);
          // Each integration cleans its own private namespace independently.
          const result=runtime.ready&&runtime.store?await runtime.store.cleanupExpired({limit:5000}):{deleted:0,limitReached:false};
          if(runtime.ready&&runtime.maintain){
            try{result.tokens=await runtime.maintain({limit:20,budgetMs:120000});}
            catch{result.tokens={error:'temporarily_unavailable'};}
          }
          if(kakao.ready&&kakao.store)result.kakao=await kakao.store.cleanup({limit:1000});
          return reply(result,result.tokens?.error?503:200);
        }});
      }
      await handler(req,res);
    }catch{sendUnavailable(res);}
  };
}

export default createVercelHandler();
