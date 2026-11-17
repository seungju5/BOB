import {createWalkingRuntime} from './walking-runtime.mjs';
import {createNodeHandler,sendUnavailable} from './http-adapter.mjs';

export function createWalkingVercelHandler({env=process.env,runtimeFactory=createWalkingRuntime}={}){
  let handler;
  return async(req,res)=>{
    try{
      if(env.VERCEL&&env.NODEJS_HELPERS!=='0')throw Error('Raw body helpers configuration required.');
      if(!handler){
        const runtime=runtimeFactory(env);
        handler=createNodeHandler({origin:runtime.config.origin,maxBodyBytes:2048,handle:request=>{
          const url=new URL(request.url);
          // One bundled walking function keeps the Hobby deployment below its
          // function limit. Vercel adds [action] metadata; remove only exactly
          // one matching segment. Extra, duplicate and mismatched queries fail.
          if(env.VERCEL&&url.searchParams.has('action')){
            const action=url.searchParams.get('action');
            if([...url.searchParams].length!==1||!/^[a-z]+$/.test(action||'')||url.pathname!=='/api/walking/'+action){
              return new Response('{"error":"invalid_request"}',{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
            }
            url.search='';request=new Request(url,{method:request.method,headers:request.headers,body:request.body,duplex:'half'});
          }
          return runtime.handle(request);
        }});
      }
      await handler(req,res);
    }catch{sendUnavailable(res);}
  };
}
export default createWalkingVercelHandler();
