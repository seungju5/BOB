import {koreanDay,STAGES} from '../auth-utils.mjs';

export function asDate(value){
  const date=value?.toDate?value.toDate():value instanceof Date?value:value?new Date(value):null;
  return date&&!Number.isNaN(date.valueOf())?date:null;
}
export function dayOf(value){const date=asDate(value);return date?koreanDay(date):null;}
export function recentDays(count,now=new Date()){
  const end=new Date(`${koreanDay(now)}T12:00:00+09:00`);
  return Array.from({length:count},(_,index)=>koreanDay(new Date(end.valueOf()-(count-1-index)*86400000)));
}
export function summarize(customers,period=7,now=new Date()){
  const days=recentDays(period,now),week=recentDays(7,now),today=week.at(-1);
  const stages=Object.fromEntries(Object.keys(STAGES).map(stage=>[stage,customers.filter(person=>person.stage===stage).length]));
  const trend=days.map(day=>({day,count:customers.filter(person=>dayOf(person.createdAt)===day).length}));
  return {total:customers.length,stages,trend,newWeek:customers.filter(person=>{const day=dayOf(person.createdAt);return day&&day>=week[0]&&day<=today;}).length,periodTotal:trend.reduce((sum,item)=>sum+item.count,0)};
}
export function filterCustomers(customers,{query='',stage='all',day='',recent=false,sort='newest'}={},now=new Date()){
  const text=query.trim().toLocaleLowerCase(),week=recentDays(7,now);
  return customers.filter(person=>{
    const created=dayOf(person.createdAt);
    return (stage==='all'||person.stage===stage)&&(!day||created===day)&&(!recent||(created&&created>=week[0]&&created<=week.at(-1)))&&`${person.displayName} ${person.email}`.toLocaleLowerCase().includes(text);
  }).sort((a,b)=>sort==='name'?String(a.displayName).localeCompare(String(b.displayName),'ko'):
    sort==='login'?(asDate(b.lastLoginAt)?.valueOf()||0)-(asDate(a.lastLoginAt)?.valueOf()||0):
    (asDate(b.createdAt)?.valueOf()||0)-(asDate(a.createdAt)?.valueOf()||0)||String(b.id).localeCompare(String(a.id)));
}
export function mergeCustomers(previous,incoming){return [...new Map([...previous,...incoming].map(person=>[person.id,person])).values()];}
