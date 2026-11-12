import {initializeApp} from 'firebase/app';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken} from 'firebase/app-check';
import {getAI,GoogleAIBackend,getGenerativeModel} from 'firebase/ai';
import {officeConfig} from './firebase-config.mjs';
import {historyFor} from './chat-core.mjs';
import {systemPrompt} from './roles.mjs';
let appCheck,ai;
export async function connectAI(){
 if(!officeConfig.allowedHosts.includes(location.hostname))throw Error('production.host required');
 if(!ai){const app=initializeApp(officeConfig.firebase,'super-members');appCheck=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(officeConfig.recaptchaSiteKey),isTokenAutoRefreshEnabled:true});ai=getAI(app,{backend:new GoogleAIBackend()});}
 await getToken(appCheck,false);
}
export async function askMember({member,turns,message,onChunk,signal}){
 await connectAI();
 const model=getGenerativeModel(ai,{model:officeConfig.model,systemInstruction:systemPrompt(member),generationConfig:{maxOutputTokens:1200,temperature:0.7}},{timeout:60000});
 const chat=model.startChat({history:historyFor(turns)});
 let result;
 try{result=await chat.sendMessageStream(message,{signal});}
 catch(error){
  // Never log prompts, response bodies, session tokens or API keys.
  console.warn('Office AI provider error',String(error?.code||'request-failed'));
  throw error;
 }
 let text='';
 for await(const chunk of result.stream){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');text+=chunk.text();onChunk(text);}
 const final=await result.response;
 if(!text.trim())text=final.text();
 if(!text.trim())throw Error('empty.response');
 return text;
}
