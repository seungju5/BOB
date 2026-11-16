import {createKakaoRuntime} from './kakao-runtime.mjs';
import {createNodeHandler,sendUnavailable} from './http-adapter.mjs';

export function createKakaoVercelHandler({env=process.env,runtimeFactory=createKakaoRuntime}={}){
  let handler;
  return async(req,res)=>{
    try{
      if(env.VERCEL&&env.NODEJS_HELPERS!=='0')throw Error('Raw body helpers configuration required.');
      if(!handler){
        const runtime=runtimeFactory(env);
        handler=createNodeHandler({origin:runtime.config.origin,handle:runtime.handle,maxBodyBytes:4096});
      }
      await handler(req,res);
    }catch{sendUnavailable(res);}
  };
}
export default createKakaoVercelHandler();
