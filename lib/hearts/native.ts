import type {HeartAction,HeartTransport} from './client';

/** Health refresh and heart refresh share the native bridge. Retry reads only. */
export function createNativeHeartsTransport(invoke:(action:HeartAction,body?:Record<string,unknown>)=>Promise<unknown>):HeartTransport{
  return {async request(action,body,signal){
    if(action==='heartmessage'||action==='heartgift')throw Error('guardian_only');
    for(let attempt=0;attempt<3;attempt++){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      try{
        const response=await invoke(action,body);
        if(signal?.aborted)throw new DOMException('Aborted','AbortError');
        return response;
      }catch(error){
        const code=error&&typeof error==='object'&&'code'in error?String(error.code):error instanceof Error?error.message:'';
        if(attempt===2||!['hearts','heartleague'].includes(action)||code!=='request_busy')throw error;
        await new Promise(resolve=>setTimeout(resolve,(attempt+1)*200));
      }
    }
  }};
}
