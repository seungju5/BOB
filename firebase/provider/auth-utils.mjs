export const CONSENT_VERSION='2026-10-16';
export function checkDisplayName(value){
  const name=String(value??'').trim();
  if(name.length<2||name.length>30||/[\u0000-\u001f]/.test(name))throw Error('표시 이름을 2~30자로 입력해 주세요.');
  return name;
}
