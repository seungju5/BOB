// An edition chooses presentation, never authentication or database permissions.
export const EDITIONS=Object.freeze({
  senior:{label:'어르신용',english:'Senior',home:'senior',account:'내 기록',title:'식사 한 번, 안부 한 번'},
  carer:{label:'보호자용',english:'Carer',home:'guardian',account:'내 계정',title:'떨어져 있어도, 가까운 안부'},
});
const common=['account','report','more','about','privacy','journey','connect','tutorial'];
export function editionFromLocation(location,declared='',remembered=null){
  const match=location.pathname.match(/\/(senior|carer|share)(?:\/index\.html|\.html|\/)?$/);
  if(match)return match[1]==='share'?'carer':match[1];
  if(location.hash==='#welcome')return null;
  const portable=location.hash.match(/^#(senior|carer)\//);
  if(portable)return portable[1];
  if(location.hash==='#senior')return 'senior';
  if(location.hash==='#account')return Object.hasOwn(EDITIONS,remembered)?remembered:'senior';
  if(['#guardian','#report','#more','#settings','#setup','#family','#alerts','#devices','#connect','#privacy','#about','#tutorial'].includes(location.hash))return 'carer';
  if(new URLSearchParams(location.search).has('code')||new URLSearchParams(location.search).has('flow'))return Object.hasOwn(EDITIONS,remembered)?remembered:'senior';
  return Object.hasOwn(EDITIONS,declared)?declared:null;
}
export function editionView(edition,requested){
  if(requested==='journey')return 'journey';
  if(!edition)return 'welcome';
  const home=EDITIONS[edition].home;
  if(common.includes(requested)||requested===home)return requested;
  if(edition==='carer'&&['settings','setup','family','alerts','devices'].includes(requested))return requested;
  if(edition==='senior'&&['settings','family'].includes(requested))return 'privacy';
  return home;
}
export function initialEditionView(location,edition){
  const query=new URLSearchParams(location.search);
  if(query.has('code')||query.has('flow'))return 'account';
  return editionView(edition,location.hash.slice(1).split('/').at(-1));
}
export function editionLink(base,edition,view=''){
  const url=new URL(edition?`${edition}/`:'./',base);
  if(view)url.hash=view;
  return url.href;
}
// Store only the screen choice for existing email callbacks; never demo or user data.
export function rememberEdition(base,edition){
  if(!Object.hasOwn(EDITIONS,edition))return;
  try{localStorage.setItem(`bapmunna-edition:${new URL(base).pathname}`,edition);}catch{}
}
export function recalledEdition(base){
  try{const saved=localStorage.getItem(`bapmunna-edition:${new URL(base).pathname}`);return Object.hasOwn(EDITIONS,saved)?saved:null;}catch{return null;}
}
