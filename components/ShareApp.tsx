'use client';

import Image from 'next/image';
import { useState } from 'react';
import { TEAM_SITE_URL } from '@/config/team';

const appUrl = new URL('/', TEAM_SITE_URL);

export function ShareApp() {
  const [notice, setNotice] = useState('');

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Warming Up · 밥뭇나', text: '밥 한 끼로 전하는 안부', url: appUrl.href });
      } else {
        await navigator.clipboard.writeText(appUrl.href);
        setNotice('공유할 링크를 복사했어요.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setNotice('아래 링크를 길게 눌러 복사하거나 QR을 저장해 주세요.');
    }
  }

  return <section className="mt-5 rounded-[1.75rem] border border-line p-5" aria-label="앱 링크와 QR 공유">
    <h2 className="text-[18px] font-bold text-cocoa">밥뭇나를 함께 써 볼까요?</h2>
    <p className="mt-2 text-[16px] text-muted">휴대폰 카메라로 QR을 비추면 밥뭇나가 열려요.</p>
    <details className="mt-3">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold text-cocoa">QR 코드 보기</summary>
      <Image className="mx-auto max-w-full" src="/bapmunna-app-qr.png" alt="밥뭇나를 여는 QR 코드" width={240} height={240} unoptimized />
      <a className="flex min-h-12 items-center justify-center text-[16px] underline" href="/bapmunna-app-qr.png" download="밥뭇나-QR.png">QR 이미지 저장</a>
    </details>
    <button type="button" className="mt-3 min-h-12 w-full rounded-full bg-butter px-5 text-[16px] font-bold text-cocoa" onClick={share}>링크 공유하기</button>
    {notice && <p role="status" className="mt-2 text-[16px]">{notice}</p>}
    <a className="mt-2 block break-all py-3 text-[16px] text-muted underline" href={appUrl.href}>{appUrl.host}</a>
  </section>;
}
