'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import './dressed-rabbit.css';

type Fit = readonly [x: number, y: number, width: number, height: number, angle: number];

// The original rabbit and every dressed body share a 310 × 500 artboard.
const fits: Record<string, Fit> = {
  'straw-hat': [30, 40, 246, 133, -6],
  'hiking-cap': [48, 52, 223, 112, -4],
  'berry-beret': [45, 40, 205, 124, -11],
  'rose-bow': [52, 88, 92, 67, -15],
  crown: [91, 55, 124, 85, -7],
  scarf: [74, 259, 171, 119, -2],
  basket: [-11, 337, 130, 116, -7],
  'rice-pouch': [7, 337, 106, 92, -9],
  'daisy-pin': [180, 322, 43, 33, 8],
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
  const bodySrc = asset('body-' + body);
  const hatSrc = hat ? asset('item-' + hat) : '';
  const accessorySrc = accessory ? asset('item-' + accessory) : '';
  const next = useMemo(() => ({bodySrc, hat, hatSrc, accessory, accessorySrc, label}),
    [bodySrc, hat, hatSrc, accessory, accessorySrc, label]);
  const [visible, setVisible] = useState(next);
  const [failed, setFailed] = useState<typeof next | null>(null);
  const id = useId();

  useEffect(() => {
    if (visible === next) return;
    let current = true;
    // On a slow connection keep the previous complete outfit until all three pieces are ready.
    Promise.all([next.bodySrc, next.hatSrc, next.accessorySrc].filter(Boolean).map(loadSprite)).then(() => {
      if (current) setVisible(next);
    }, () => { if (current) setFailed(next); });
    return () => { current = false; };
  }, [next, visible]);

  const clip = (part: string) => `url(#${id}-${part})`;
  const bodyRef = '#' + id + '-body';
  const closedHat = visible.hat === 'berry-beret' || visible.hat === 'straw-hat' || visible.hat === 'hiking-cap';
  const carriesBag = visible.accessory === 'basket' || visible.accessory === 'rice-pouch';
  return <div className="warming-rabbit" role="img" aria-label={visible.label}>
    <svg className="warming-figure" viewBox="0 0 310 500" aria-hidden="true" focusable="false">
      <defs>
        {/* The plush ears fold under a closed hat. Trim the body once so the chin
            and gripping paw reused in front of accessories cannot restore an ear. */}
        <clipPath id={id + '-tucked'}>
          <path d="M0 155H47C69 131 90 116 122 110Q161 99 197 110C224 115 249 137 268 159H310V500H0Z"/>
        </clipPath>
        <image id={id + '-body'} href={visible.bodySrc} width="310" height="500"
          clipPath={closedHat ? clip('tucked') : undefined}/>
        <radialGradient id={id + '-shadow'}>
          <stop stopColor="#5b412d" stopOpacity=".60"/>
          <stop offset=".55" stopColor="#684b35" stopOpacity=".27"/>
          <stop offset="1" stopColor="#75563e" stopOpacity="0"/>
        </radialGradient>
        <clipPath id={id + '-chin'}>
          <path d="M0 0H310V258Q272 277 240 290Q222 297 203 299Q175 304 154 300Q130 298 119 295Q94 292 74 287Q37 274 0 258Z"/>
        </clipPath>
        <clipPath id={id + '-grip'}>
          <path d="M32 324Q63 292 100 303Q117 309 110 333Q99 357 75 364Q49 371 35 352Z"/>
        </clipPath>
        <clipPath id={id + '-ears'}>
          <path d="M30 0H130L140 73Q121 86 91 84L35 75ZM129 0H224V65Q201 76 170 73L146 67Z"/>
        </clipPath>
        <clipPath id={id + '-brim'} clipPathUnits="objectBoundingBox">
          <path d="M0 0H1V.80Q.92 .905 .80 .89C.68 .847 .61 .833 .50 .833C.38 .833 .26 .857 .17 .906Q.085 .91 0 .79Z"/>
        </clipPath>
      </defs>
      <g fill={clip('shadow')} className="warming-ground">
        <ellipse cx="153" cy="490" rx="119" ry="12" opacity=".65"/>
        <ellipse cx="99" cy="488" rx="39" ry="7"/>
        <ellipse cx="204" cy="490" rx="46" ry="7"/>
      </g>
      <g className="warming-dressed-pose">
        <use href={bodyRef}/>
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
