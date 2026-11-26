'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { WARMING_RABBIT_ART } from '@/components/Mascot';
import './dressed-rabbit.css';

type Fit = readonly [x: number, y: number, width: number, height: number, angle: number];

// Fits use the senior home's 480px portrait, including its pencil and clipboard.
const fits: Record<string, Fit> = {
  'straw-hat': [94, 66, 255, 113, 8],
  'hiking-cap': [115, 73, 219, 101, 9],
  'berry-beret': [115, 44, 195, 126, 8],
  'rose-bow': [158, 89, 75, 52, -11],
  crown: [206, 59, 90, 68, 9],
  scarf: [158, 251, 144, 92, 7],
  basket: [100, 314, 95, 90, 5],
  'rice-pouch': [130, 316, 78, 74, 8],
  'daisy-pin': [222, 327, 31, 29, 8],
  dungarees: [146, 278, 157, 137, 4],
  'picnic-dress': [132, 270, 181, 144, 4],
  raincoat: [126, 260, 199, 145, 4],
  vest: [145, 271, 164, 123, 4],
  hanbok: [128, 266, 190, 145, 4],
  'star-cape': [121, 271, 214, 131, 4],
};

type Props = {
  body: string;
  hat: string | null;
  accessory: string | null;
  asset: (name: string) => string;
  label: string;
};

const decoded = new Map<string, Promise<void>>();

function loadSprite(src: string) {
  const cached = decoded.get(src);
  if (cached) return cached;
  const image = new Image();
  const ready = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Wardrobe image unavailable'));
    image.src = src;
  }).then(() => image.decode?.()).catch(error => {
    decoded.delete(src);
    throw error;
  });
  decoded.set(src, ready);
  return ready;
}

function WornItem({ id, src, brim }: { id: string | null; src: string; brim: string }) {
  const fit = id && fits[id];
  if (!fit) return null;
  const [x, y, width, height, angle] = fit;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return <g transform={`rotate(${angle} ${cx} ${cy})`}>
    <image href={src} x={x} y={y} width={width} height={height} preserveAspectRatio="none"
      clipPath={id === 'berry-beret' ? brim : undefined}
      transform={id === 'hiking-cap' ? `translate(${cx * 2} 0) scale(-1 1)` : undefined}/>
  </g>;
}

export function DressedRabbit({ body, hat, accessory, asset, label }: Props) {
  const outfit = body === 'base' ? null : body;
  const outfitSrc = outfit ? asset('item-' + outfit) : '';
  const hatSrc = hat ? asset('item-' + hat) : '';
  const accessorySrc = accessory ? asset('item-' + accessory) : '';
  const next = useMemo(() => ({ outfit, outfitSrc, hat, hatSrc, accessory, accessorySrc, label }),
    [outfit, outfitSrc, hat, hatSrc, accessory, accessorySrc, label]);
  const [visible, setVisible] = useState(next);
  const [failed, setFailed] = useState<typeof next | null>(null);
  const id = useId();

  useEffect(() => {
    if (visible === next) return;
    let current = true;
    // On a slow connection keep the previous complete outfit until all three pieces are ready.
    Promise.all([next.outfitSrc, next.hatSrc, next.accessorySrc].filter(Boolean).map(loadSprite)).then(() => {
      if (current) setVisible(next);
    }, () => { if (current) setFailed(next); });
    return () => { current = false; };
  }, [next, visible]);

  const clip = (part: string) => `url(#${id}-${part})`;
  const bodyRef = '#' + id + '-body';
  const closedHat = visible.hat === 'berry-beret' || visible.hat === 'straw-hat' || visible.hat === 'hiking-cap';
  const carriesBag = visible.accessory === 'basket' || visible.accessory === 'rice-pouch';
  return <div className="warming-rabbit" role="img" aria-label={visible.label}>
    <svg className="warming-figure" viewBox="85 -6 320 476" aria-hidden="true" focusable="false">
      <defs>
        {/* The plush ears fold under a closed hat. Trim the body once so the chin
            and gripping paw reused in front of accessories cannot restore an ear. */}
        <clipPath id={id + '-tucked'}>
          <path d="M0 169H113Q149 108 201 104Q255 95 292 130Q315 145 328 184H480V480H0Z"/>
        </clipPath>
        <image id={id + '-body'} href={WARMING_RABBIT_ART} width="480" height="480"
          clipPath={closedHat ? clip('tucked') : undefined}/>
        <radialGradient id={id + '-shadow'}>
          <stop stopColor="#5b412d" stopOpacity=".60"/>
          <stop offset=".55" stopColor="#684b35" stopOpacity=".27"/>
          <stop offset="1" stopColor="#75563e" stopOpacity="0"/>
        </radialGradient>
        <clipPath id={id + '-chin'}>
          <path d="M0 0H480V256L327 251Q319 277 283 283Q231 298 175 276Q136 272 101 246H0Z"/>
        </clipPath>
        <clipPath id={id + '-grip'}>
          <path d="M173 288Q187 274 199 282Q215 278 221 296Q224 315 206 331Q191 345 177 333Q165 320 170 302Z"/>
        </clipPath>
        <clipPath id={id + '-ears'}>
          <path d="M115 0H204L213 98Q191 115 161 126L125 88ZM285 73Q361 57 406 166L396 187Q337 194 305 129Z"/>
        </clipPath>
        <clipPath id={id + '-notebook'}>
          <path d="M175 259Q176 252 182 254L228 314L229 326L221 319Z M228 352L249 272Q250 267 256 268L274 271L277 266Q285 260 295 270L297 276L321 280Q326 281 324 288L312 324Q328 321 331 342Q335 364 314 369Q298 373 286 363Z"/>
        </clipPath>
        <clipPath id={id + '-brim'} clipPathUnits="objectBoundingBox">
          <path d="M0 0H1V.80Q.92 .905 .80 .89C.68 .847 .61 .833 .50 .833C.38 .833 .26 .857 .17 .906Q.085 .91 0 .79Z"/>
        </clipPath>
      </defs>
      <g fill={clip('shadow')} className="warming-ground">
        <ellipse cx="244" cy="457" rx="84" ry="8" opacity=".65"/>
        <ellipse cx="199" cy="455" rx="28" ry="4"/>
        <ellipse cx="290" cy="453" rx="34" ry="5"/>
      </g>
      <g className="warming-dressed-pose">
        <use href={bodyRef}/>
        <WornItem id={visible.outfit} src={visible.outfitSrc} brim={clip('brim')}/>
        {visible.outfit && <>
          <use href={bodyRef} clipPath={clip('chin')}/>
          <use href={bodyRef} clipPath={clip('grip')}/>
          <use href={bodyRef} clipPath={clip('notebook')}/>
        </>}
        <WornItem id={visible.accessory} src={visible.accessorySrc} brim={clip('brim')}/>
        {visible.accessory === 'scarf' && <use href={bodyRef} clipPath={clip('chin')}/>}
        {carriesBag && <use href={bodyRef} clipPath={clip('grip')}/>}
        <WornItem id={visible.hat} src={visible.hatSrc} brim={clip('brim')}/>
        {visible.hat === 'crown' && <use href={bodyRef} clipPath={clip('ears')}/>}
      </g>
    </svg>
    {failed === next && <span className="warming-image-error" role="status">새 차림 그림을 불러오지 못했어요.</span>}
  </div>;
}
