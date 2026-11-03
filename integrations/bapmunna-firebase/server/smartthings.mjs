import {ApiError,identifier} from './security.mjs';

export function smartThingsClient(config,fetcher=fetch){
  async function request(path,{token,method='GET',body,form}={}){
    const response=await fetcher(`https://api.smartthings.com${path}`,{
      method,redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`}),...(body?{'Content-Type':'application/json'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
      body:form?new URLSearchParams(form).toString():body?JSON.stringify(body):undefined,
    });
    if(!response.ok){
      const code={401:'reconnect_required',402:'plan_required',403:'permission_required',404:'device_missing',409:'subscription_exists',429:'rate_limited'}[response.status]||'upstream_unavailable';
      throw new ApiError(response.status===401?401:response.status===429?429:502,code);
    }
    if(response.status===204)return {};
    const raw=await response.text();if(raw.length>2097152)throw new ApiError(502,'upstream_unavailable');
    return raw?JSON.parse(raw):{};
  }
  const devicePath=id=>{if(!identifier(id))throw new ApiError(400,'invalid_device');return `/v1/devices/${id}`;};
  const subscriptions=id=>{if(!identifier(id))throw new ApiError(400,'invalid_installation');return `/v1/installedapps/${id}/subscriptions`;};
  return {
    async exchange(code){return request(`${config.oauth}/token`,{method:'POST',form:{grant_type:'authorization_code',code,client_id:config.clientId,redirect_uri:config.redirect}});},
    async refresh(refreshToken){return request(`${config.oauth}/token`,{method:'POST',form:{grant_type:'refresh_token',refresh_token:refreshToken,client_id:config.clientId}});},
    async devices(token){
      const items=[];let path='/v1/devices';
      for(let page=0;path&&page<5;page++){
        const data=await request(path,{token});items.push(...(data.items||[]));
        if(!data._links?.next?.href)return items;
        const next=new URL(data._links.next.href,'https://api.smartthings.com');
        if(next.origin!=='https://api.smartthings.com'||next.pathname!=='/v1/devices')throw new ApiError(502,'upstream_unavailable');
        path=next.pathname+next.search;
      }
      throw new ApiError(422,'too_many_devices');
    },
    device:(token,id)=>request(devicePath(id),{token}),
    status:(token,id)=>request(`${devicePath(id)}/status`,{token}),
    async subscribe(token,installId,deviceId){
      const path=subscriptions(installId),legacy=config.oauth==='/oauth';
      try{return await request(path,{token,method:'POST',body:legacy
        ?{sourceType:'DEVICE',device:{deviceId,componentId:'*',capability:'*',attribute:'*',value:'*',stateChangeOnly:true,subscriptionName:'bapmunnaSignals'}}
        :{sourceType:'DEVICE',device:{deviceId},subscriptionName:'bapmunnaSignals'}});}
      catch(error){if(error.code!=='subscription_exists')throw error;}
      // A name conflict alone does not prove this device is subscribed. Read the
      // existing subscription before treating a retry/reauthorization as ready.
      const existing=await request(path,{token});
      const match=(Array.isArray(existing.items)?existing.items:[]).find(item=>item.sourceType==='DEVICE'
        &&item.device?.deviceId===deviceId
        &&(legacy?item.device.subscriptionName:item.subscriptionName)==='bapmunnaSignals'
        &&(!legacy||(['*','powerMeter'].includes(item.device.capability)&&['*','power'].includes(item.device.attribute))));
      if(!match)throw new ApiError(409,'subscription_conflict');
      return match;
    },
    unsubscribe:(token,installId)=>request(subscriptions(installId),{token,method:'DELETE'}),
    async confirm(url){
      const target=new URL(url);
      if(target.origin!=='https://api.smartthings.com'||target.username||target.password||target.hash||![`/v1/apps/${config.appId}/confirm-registration`,`/apps/${config.appId}/confirm-registration`].includes(target.pathname)||!target.searchParams.get('token'))throw new ApiError(400,'invalid_confirmation');
      const response=await fetcher(target,{redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new ApiError(502,'confirmation_failed');
    },
  };
}

export function safeDevice(device){
  const caps=new Set((device.components||[]).flatMap(component=>(component.capabilities||[]).map(x=>x.id)));
  return {id:device.deviceId,label:String(device.label||device.name||'이름 없는 기기').slice(0,100),power:caps.has('powerMeter'),energy:caps.has('energyMeter')||caps.has('powerConsumptionReport')};
}
export function readingSummary(status,now){
  for(const component of Object.values(status.components||{})){
    const power=component?.powerMeter?.power;
    if(typeof power?.value==='number'&&Number.isFinite(power.value)&&power.value>=0&&power.unit==='W'){
      const time=Date.parse(power.timestamp);
      return {hasPower:true,measuredAt:Number.isFinite(time)&&time<=now+60000?time:null};
    }
  }
  return {hasPower:false,measuredAt:null};
}
