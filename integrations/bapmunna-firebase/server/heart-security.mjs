import {WalkingError} from './walking-security.mjs';

export const HEART_CONSENT='2026-11-17-hearts';
export const HEART_MESSAGE_DAYS=30;
export const HEART_MAX_MESSAGES=20;
export const HEART_MAX_PHOTO_BYTES=160000;
export const HEART_MESSAGE_BODY_BYTES=220000;
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function heartFields(value,allowed,{required=[]}={}){
  if(!record(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new WalkingError(400,'invalid_heart_settings');
  return value;
}
export function heartGoal(value){
  if(!Number.isSafeInteger(value)||value<500||value>20000||value%100)throw new WalkingError(400,'invalid_heart_goal');
  return value;
}
export function heartRegion(value){
  if(typeof value!=='string')throw new WalkingError(400,'invalid_heart_settings');
  const result=value.normalize('NFC').trim().replace(/ +/g,' ');
  if(result.length>24||result&&!/^[\p{L} ]{1,24}$/u.test(result))throw new WalkingError(400,'invalid_heart_settings');
  return result;
}
export function heartSettings(value,{join=false}={}){
  heartFields(value,join?['consentVersion','enabled','goal','leagueEnabled','region']:['enabled','goal','leagueEnabled','region'],{required:join?['consentVersion','enabled','goal','leagueEnabled','region']:[]});
  if(join&&(value.consentVersion!==HEART_CONSENT||value.enabled!==true))throw new WalkingError(400,'heart_consent_required');
  if(!join&&!Object.keys(value).length)throw new WalkingError(400,'invalid_heart_settings');
  const result={};
  for(const key of ['enabled','leagueEnabled'])if(Object.hasOwn(value,key)){if(typeof value[key]!=='boolean')throw new WalkingError(400,'invalid_heart_settings');result[key]=value[key];}
  if(Object.hasOwn(value,'goal'))result.goal=heartGoal(value.goal);
  if(Object.hasOwn(value,'region'))result.region=heartRegion(value.region);
  return result;
}
export function heartItem(value,{equip=false}={}){
  heartFields(value,['itemId'],{required:['itemId']});
  if(typeof value.itemId!=='string'||!(/^[a-z][a-z-]{1,31}$/.test(value.itemId))||!equip&&value.itemId.startsWith('default'))throw new WalkingError(400,'invalid_heart_item');
  return value.itemId;
}
function jpegDimensions(bytes){
  let position=2;
  while(position+4<=bytes.length){
    if(bytes[position]!==255)return false;
    while(bytes[position]===255)position++;
    const marker=bytes[position++];
    if(marker===217||marker===218)return false;
    if(marker===216||marker===1||(marker>=208&&marker<=215))continue;
    if(position+2>bytes.length)return false;
    const length=bytes.readUInt16BE(position);if(length<2||position+length>bytes.length)return false;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
      if(length<8)return false;
      const height=bytes.readUInt16BE(position+3),width=bytes.readUInt16BE(position+5);
      return width>0&&width<=4096&&height>0&&height<=4096;
    }
    position+=length;
  }
  return false;
}
export function heartPhoto(value){
  if(value===undefined)return undefined;
  if(typeof value!=='string'||value.length>Math.ceil(HEART_MAX_PHOTO_BYTES/3)*4+32)throw new WalkingError(400,'invalid_heart_photo');
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw new WalkingError(400,'invalid_heart_photo');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>HEART_MAX_PHOTO_BYTES||bytes.toString('base64')!==match[2])throw new WalkingError(400,'invalid_heart_photo');
  const png=match[1]==='png'&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(16)<=4096&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=4096;
  const jpeg=match[1]==='jpeg'&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217&&jpegDimensions(bytes);
  if(!png&&!jpeg)throw new WalkingError(400,'invalid_heart_photo');
  return value;
}
export function heartMessage(value){
  heartFields(value,['text','photo','unlockPercent','requestId'],{required:['text']});
  if(typeof value.text!=='string')throw new WalkingError(400,'invalid_heart_message');
  const text=value.text.normalize('NFC').trim();
  if(!text||[...text].length>280||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new WalkingError(400,'invalid_heart_message');
  const unlockPercent=value.unlockPercent??0;
  if(![0,25,50,100,200].includes(unlockPercent))throw new WalkingError(400,'invalid_heart_message');
  if(Object.hasOwn(value,'requestId')&&(typeof value.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)))throw new WalkingError(400,'invalid_heart_message');
  const photo=heartPhoto(value.photo);return {text,unlockPercent,...(photo?{photo}:{}),...(value.requestId?{requestId:value.requestId.toLowerCase()}:{})};
}
export function heartMessageId(value){
  heartFields(value,['id'],{required:['id']});
  if(typeof value.id!=='string'||!/^[-_A-Za-z0-9]{16,48}$/.test(value.id))throw new WalkingError(400,'invalid_heart_message');
  return value.id;
}
export function heartFailure(error){
  if(error instanceof WalkingError)return error;
  if(['insufficient_hearts','heart_item_not_owned'].includes(error?.code))return new WalkingError(409,error.code);
  if(['unknown_heart_item','invalid_heart_goal','invalid_heart_settings'].includes(error?.code))return new WalkingError(400,error.code);
  return error;
}
