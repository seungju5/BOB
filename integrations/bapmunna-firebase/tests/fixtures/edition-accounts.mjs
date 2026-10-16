// Synthetic verified user, in memory only. The fixture is outside public docs/.
import {koreanDay,CONSENT_VERSION} from '/auth-utils.mjs';
let meals=[],listener=null,watches=0,saves=0;
let profile={displayName:'가상 봄님',consentVersion:CONSENT_VERSION};
const user={id:'local-example',verified:true,email:'senior-or-carer@example.test',displayName:'가상 봄님'};
function audit(){document.querySelector('#fixture-audit').textContent=`식사 조회 ${watches} · 저장 ${saves}`;}
export async function connectCloud(){return {
  name:'Local fixture',supportsGoogle:false,
  onUser(callback){queueMicrotask(()=>callback(user));return ()=>{};},
  async getProfile(){return profile;},async isStaff(){return false;},async touchLogin(){audit();},
  watchMeals(callback){watches++;listener=callback;queueMicrotask(()=>callback(meals));audit();return ()=>{listener=null;};},
  async saveProfile(displayName){profile={...profile,displayName};},
  async saveMeal(meal,kind){saves++;const day=koreanDay(),id=`${day}-${meal}`;meals=meals.filter(row=>row.id!==id).concat({id,day,meal,kind});audit();listener?.(meals);},
  async removeMeal(id){meals=meals.filter(row=>row.id!==id);listener?.(meals);},
  async signOut(){},
};}
