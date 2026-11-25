'use client';

import { useId } from 'react';
import { DressedRabbit } from './DressedRabbit';
import './outfit-lookbook.css';

const cape = { id: 'star-cape', title: '별빛 산책', detail: '별자수 망토', pieces: { outfit: 'star-cape' } } as const;
export const HEART_LOOKS = [
  cape,
  { id: 'hanbok', title: '꽃마중', detail: '고운 한복', pieces: { outfit: 'hanbok' } },
] as const;
export const TRAIL_LOOKS = [
  { id: 'berry-picnic', title: '딸기 소풍', detail: '체크 원피스와 주먹밥 파우치',
    pieces: { hat: 'berry-beret', outfit: 'picnic-dress', accessory: 'rice-pouch', background: 'blossom' } },
  { id: 'rainy-walk', title: '비 오는 산책', detail: '소라빛 우비와 데이지 브로치',
    pieces: { hat: null, outfit: 'raincoat', accessory: 'daisy-pin', background: null } },
  { ...cape, pieces: { hat: null, outfit: 'star-cape', accessory: null, background: 'moon' } },
] as const;
export type LookbookStyle = (typeof HEART_LOOKS)[number] | (typeof TRAIL_LOOKS)[number];

export function linkedOutfit(search: string, heart: boolean) {
  const id = new URLSearchParams(search).get('outfit');
  return (heart ? HEART_LOOKS : TRAIL_LOOKS).find(style => style.id === id);
}

/** A shared link opens a fitting. The URL carries no purchases or saved wardrobe data. */
export function setOutfitLink(id: string | null) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('outfit') === id) return;
  if (id === null) url.searchParams.delete('outfit');
  else url.searchParams.set('outfit', id);
  try { window.history.replaceState(window.history.state, '', url); }
  catch { /* Embedded webviews can disallow URL updates while still allowing a fitting. */ }
}

type Props = {
  equipped: { hat: string | null; outfit: string | null; accessory: string | null; background: string | null };
  items: readonly { id: string; price?: number }[];
  asset: (name: string) => string;
  wallet?: { balance: number; owned: readonly string[] };
  trailCollection?: { visited: number; canWearCape: boolean };
  selected: string | null;
  disabled?: boolean;
  onTry: (style: LookbookStyle) => void;
};

export function OutfitLookbook({ equipped, items, asset, wallet, trailCollection, selected, disabled, onTry }: Props) {
  const heading = useId();
  const styles = wallet ? HEART_LOOKS : TRAIL_LOOKS;
  return <section aria-labelledby={heading} className="outfit-lookbook">
    <h3 id={heading}>워밍이 코디북</h3>
    <p>차림을 눌러 먼저 입어 보세요.</p>
    <div className="outfit-lookbook-grid">
      {styles.map(style => {
        const garment = items.find(item => item.id === style.pieces.outfit);
        if (!garment) return null;
        const worn = { ...equipped, ...style.pieces };
        const active = selected === style.id;
        const owned = wallet?.owned.includes(garment.id);
        const missing = Math.max(0, (garment.price ?? 0) - (wallet?.balance ?? 0));
        const trailCape = !wallet && style.id === 'star-cape';
        let available = '무료 착용';
        if (wallet) available = owned ? '보유 · 무료 착용' : '하트 ' + garment.price + '개' + (missing ? ' · ' + missing + '개 부족' : '');
        else if (trailCape) available = trailCollection?.canWearCape ? '획득 · 무료 착용' : '산책길 도장 ' + (trailCollection?.visited ?? 0) + '/3개';
        return <button type="button" key={style.id} className={'lookbook-card' + (trailCape ? ' lookbook-wide' : '')}
          data-style={style.id} aria-pressed={active} disabled={disabled} onClick={() => onTry(style)}>
          <span className="lookbook-portrait" aria-hidden="true">
            <DressedRabbit body={worn.outfit ?? 'base'} hat={worn.hat} accessory={worn.accessory} asset={asset} label={style.title}/>
            {active && <span className="lookbook-mark">✓</span>}
          </span>
          <span className="lookbook-copy">
            <strong>{style.title}</strong><span className="lookbook-detail">{style.detail}</span>
            <span className="lookbook-availability">{active ? '시착 중 · ' : ''}{available}</span>
          </span>
        </button>;
      })}
    </div>
  </section>;
}
