// Account-owned preparation settings. This is not a care-sharing grant.
export const PREFERENCE_FIELDS=['schemaVersion','onboardingStep','phone','relationLabel','windows','eatOutPerWeek','usesKeepWarm','cooksPerWeek','missedMealsThreshold','fastingHours','emergencyHours','preparationAcknowledged'];
export function preferenceFields(input){
  const invalid=()=>{throw Object.assign(Error('생활·알림 기준과 식사 시간을 다시 확인해 주세요.'),{code:'preferences/invalid-input'});};
  if(!input||typeof input!=='object'||Object.keys(input).length!==PREFERENCE_FIELDS.length||!PREFERENCE_FIELDS.every(key=>Object.hasOwn(input,key)))invalid();
  const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
  if(typeof input.relationLabel!=='string'||input.relationLabel.length>30||input.relationLabel!==input.relationLabel.trim())invalid();
  if(input.schemaVersion!==1||!integer(input.onboardingStep,1,8)||typeof input.phone!=='string'||input.phone.length>24||!/^\+?[0-9 ()-]{0,24}$/.test(input.phone)
    ||!integer(input.eatOutPerWeek,0,20)||!integer(input.cooksPerWeek,1,21)||typeof input.usesKeepWarm!=='boolean'
    ||!integer(input.missedMealsThreshold,3,10)||!integer(input.fastingHours,12,108)||input.fastingHours%6!==0
    ||!integer(input.emergencyHours,24,120)||input.emergencyHours%6!==0||input.emergencyHours-input.fastingHours<12
    ||typeof input.preparationAcknowledged!=='boolean'||!Array.isArray(input.windows)||!integer(input.windows.length,1,5))invalid();
  const slots=new Set();let lastEnd='';
  for(const window of input.windows){
    if(!window||Object.keys(window).length!==3||!['slot','start','end'].every(key=>Object.hasOwn(window,key))
      ||!['breakfast','lunch','dinner','fourth','fifth'].includes(window.slot)||slots.has(window.slot)
      ||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(window.start)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(window.end)
      ||window.start>=window.end||window.start<lastEnd)invalid();
    slots.add(window.slot);lastEnd=window.end;
  }
  return Object.fromEntries(PREFERENCE_FIELDS.map(key=>[key,key==='windows'?input.windows.map(w=>({...w})):input[key]]));
}
