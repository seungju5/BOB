'use client';

import { useId, useRef, useState } from 'react';
import { IconArrowRight, IconCheck, IconHeart } from '@/components/icons';
import { CATEGORIES, changedParts, lookName, type Look, type LookChanges, type WardrobeItem } from '@/lib/walking/wardrobe';
import type { HeartCategory } from '@/packages/walking-hearts/core.mjs';
import { ItemArt, PartIcon, WarmingStage } from './WarmingArt';
import './wardrobe.css';

type Props = {
  equipped: Look;
  items: readonly WardrobeItem[];
  initialCategory?: HeartCategory;
  wallet?: { balance: number; owned: readonly string[] };
  busy?: boolean;
  onSave: (changes: LookChanges) => boolean | Promise<boolean>;
  onCancel: () => void;
};

export function WarmingWardrobe({ equipped, items, initialCategory = 'hat', wallet, busy, onSave, onCancel }: Props) {
  const [category, setCategory] = useState<HeartCategory>(initialCategory);
  const [changes, setChanges] = useState<LookChanges>({});
  const [walking, setWalking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const priceId = useId();
  const draft = { ...equipped, ...changes };
  const delta = changedParts(equipped, changes);
  const cost = wallet ? items.reduce((total, item) =>
    total + (delta[item.category] === item.id && !wallet.owned.includes(item.id) ? item.price ?? 0 : 0), 0) : 0;
  const shortfall = Math.max(0, cost - (wallet?.balance ?? 0));
  const disabled = busy || saving;
  const part = CATEGORIES.find(entry => entry.id === category)!;
  const selected = items.find(item => item.id === draft[category]);
  const options: readonly { id: Look[HeartCategory]; name: string; price?: number }[] =
    [...items.filter(item => item.category === category), { id: null, name: part.basic }];

  async function save() {
    if (pending.current || disabled || shortfall) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    try {
      if (!await onSave(delta)) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <div className="ward-editor" aria-label="워밍이 옷장">
    <WarmingStage look={draft} walking={walking} toggleWalk={() => setWalking(!walking)}/>
    <section className="ward-picker" aria-label="산책 차림 선택">
      <div className="ward-picker-title">
        <h2><PartIcon part="hanger"/>산책 옷장</h2>
        {wallet && <span className="ward-wallet" aria-label={'보유 하트 ' + wallet.balance + '개'}><IconHeart/>{wallet.balance}</span>}
      </div>
      <div className="ward-tabs" role="group" aria-label="꾸미기 종류">
        {CATEGORIES.map(entry => <button type="button" key={entry.id} disabled={disabled}
          aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}
          onKeyDown={event => {
            const index = CATEGORIES.indexOf(entry);
            const positions: Record<string, number> = {
              ArrowRight: (index + 1) % CATEGORIES.length,
              ArrowLeft: (index + CATEGORIES.length - 1) % CATEGORIES.length,
              Home: 0, End: CATEGORIES.length - 1,
            };
            const next = positions[event.key];
            if (next === undefined) return;
            event.preventDefault();
            setCategory(CATEGORIES[next].id);
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
          }}>
          <PartIcon part={entry.id}/><span>{entry.name}</span>
        </button>)}
      </div>
      <div className="ward-options" role="group" aria-label={part.name + ' 선택'}>
        {options.map(item => {
          const active = draft[category] === item.id;
          const priced = wallet && item.id && !wallet.owned.includes(item.id);
          return <button type="button" key={item.id ?? 'basic'} className="ward-option" data-category={category}
            aria-label={item.name} aria-pressed={active} disabled={disabled}
            aria-describedby={wallet ? priceId + (item.id ?? 'basic') : undefined}
            onClick={() => { setChanges(previous => ({ ...previous, [category]: item.id })); setFailed(false); }}>
            <span className="ward-swatch"><ItemArt id={item.id} category={category}/>
              {active && <span className="ward-selected"><IconCheck/></span>}
            </span>
            <span className="ward-item-name">{item.name}</span>
            {wallet && <small id={priceId + (item.id ?? 'basic')} className="ward-price">{priced ? <><IconHeart/><span className="sr-only">하트 </span>{item.price}<span className="sr-only">개</span></> : item.id ? '보유' : '기본'}</small>}
          </button>;
        })}
      </div>
      <p className="sr-only" role="status">{CATEGORIES.map(({ id }) => lookName(id, draft[id])).join(' · ')}</p>
      {selected?.unlockDays && <p className="ward-hint">밥솥·외식 소식이 {selected.unlockDays}일 이어져도 받을 수 있어요.</p>}
      <div className="ward-actions">
        {failed && <p className="ward-error" role="alert">저장을 마치지 못했어요. 고른 차림으로 다시 시도해 주세요.</p>}
        {shortfall > 0 && <p className="ward-error" role="status">이 차림을 입히려면 하트 {shortfall}개가 더 필요해요.</p>}
        <button type="button" className="ward-primary" disabled={disabled || shortfall > 0} onClick={() => void save()}>
          <span>{saving ? '차림을 저장하고 있어요' : cost ? '하트 ' + cost + '개로 입고 산책' : '이 차림으로 산책'}</span><IconArrowRight/>
        </button>
        <button type="button" className="ward-cancel" onClick={onCancel} disabled={disabled}>저장하지 않고 돌아가기</button>
      </div>
    </section>
  </div>;
}
