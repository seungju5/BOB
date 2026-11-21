'use client';
import Image from 'next/image';
import {useState} from 'react';
import {APP_BASE_PATH,appPath} from '@/lib/app-path';
import {publicUrl} from '@/lib/deployment';
const URL=publicUrl('/app/');
export function ShareApp(){
 const [notice,setNotice]=useState('');
 if(APP_BASE_PATH!=='/bapmunna/app')return null;
 return <section className="mt-5 rounded-[1.75rem] border border-line p-5" aria-label="앱 링크와 QR 공유">
  <h2 className="text-[18px] font-bold text-cocoa">밥뭇나를 함께 써 볼까요?</h2>
  <p className="mt-2 text-[16px] text-muted">카메라로 QR을 비추면 같은 앱으로 바로 들어와요.</p>
  <details className="mt-3"><summary className="flex min-h-12 cursor-pointer items-center font-semibold text-cocoa">QR 코드 보기</summary><Image className="mx-auto max-w-full" src={appPath('/bapmunna-app-qr.png')} alt="밥뭇나 앱에 접속하는 QR 코드" width={240} height={240} unoptimized/><a className="flex min-h-12 items-center justify-center text-[16px] underline" href={appPath('/bapmunna-app-qr.png')} download="밥뭇나-QR.png">QR 이미지 저장</a></details>
  <button className="mt-3 min-h-12 w-full rounded-full bg-butter px-5 text-[16px] font-bold text-cocoa" onClick={async()=>{try{if(navigator.share){await navigator.share({title:'밥뭇나',text:'안부가 폴짝 찾아왔어요.',url:URL});}else{await navigator.clipboard.writeText(URL);setNotice('공유할 링크를 복사했어요.');}}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;setNotice('아래 링크를 길게 눌러 복사하거나 QR을 저장해 주세요.');}}}>링크 공유하기</button>
  {notice?<p role="status" className="mt-2 text-[16px]">{notice}</p>:null}
  <a className="mt-2 block break-all py-3 text-[16px] text-muted underline" href={URL}>{URL.replace('https://','')}</a>
 </section>;
}
