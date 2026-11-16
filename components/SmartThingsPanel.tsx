'use client';

import { useEffect, useRef, useState } from 'react';
import { appPath } from '@/lib/app-path';
import { updateFirebaseConnection } from '@/lib/data/firebase';
import { loadSmartThingsModule } from '@/lib/firebase/smartthings';
import styles from './SmartThingsPanel.module.css';

export function SmartThingsPanel({ accountKey, returnTo = '/home' }: { accountKey?: string; returnTo?: '/home' | '/onboarding' }) {
  const target = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, dispose: (() => void) | undefined;
    const element = target.current;
    if (!element) return;
    element.textContent = '연결 안내를 불러오고 있어요…';
    void loadSmartThingsModule().then(module => {
      if (!active) return;
      dispose = module.mountSmartThings(element, {
        accountHref: appPath('/login/'), homeHref: appPath(`${returnTo}/`), homeLabel: returnTo === '/onboarding' ? '우리 집 설정 이어가기' : '홈으로 돌아가기',
        consentHref: appPath('/settings#device'), onConnection: updateFirebaseConnection,
      });
    }).catch(() => { if (active) { element.textContent = ''; setFailed(true); } });
    return () => { active = false; dispose?.(); };
  }, [accountKey, attempt, returnTo]);
  return <div className={styles.panel}>
    <div ref={target} aria-label="삼성 계정 기기 연결">연결 안내를 불러오고 있어요…</div>
    {failed ? <div role="alert"><p>연결 안내를 불러오지 못했어요. 입력한 설정은 그대로예요.</p><button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>다시 확인하기</button></div> : null}
  </div>;
}
