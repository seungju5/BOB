import type { ReactNode } from 'react';

const cream = '#fff3d9', gold = '#efc46e', leaf = '#a3b994', rose = '#df927e';
const marks = {
  trail: <><path d="M4 25c3-4 10 2 15-3s-1-8 7-10" strokeDasharray="1.5 3.4"/><g fill={leaf} transform="rotate(-21 12 12)"><ellipse cx="10" cy="8" rx="2.1" ry="4.7"/><ellipse cx="15" cy="8" rx="2" ry="4.4"/><path d="M8 15c0-5 9-5 9 0 0 4-9 5-9 0Z"/></g></>,
  letter: <><rect x="3" y="8" width="26" height="18" rx="4" fill={cream}/><path d="m4 10 12 9 12-9M5 24l7-7m15 7-7-7"/><path fill={rose} d="M16 19s-5.5-3.3-5.5-6c0-2.4 3.4-3.4 5.5-.5 2.1-2.9 5.5-1.9 5.5.5 0 2.7-5.5 6-5.5 6Z"/></>,
  hanger: <><path fill={leaf} d="M9 8c.4-3 3-4 5-2.8C14 2 18 2 18.8 4c1.6-2.8 4.5-1.6 4.8.9.4 2.3-2.5 4-4.8 4.6"/><path d="M13 11c0-3.7 6.8-4 6.8-.1 0 2.3-3.8 2.4-3.8 5.2l12 7.2c1.4.9.7 3-1 3H5c-1.7 0-2.4-2.1-1-3l12-7.2"/><path stroke="#b98249" d="m7 23.5 4.2.1"/></>,
  cooker: <><path d="M11 7c2-2-1-2.6 1-4.8m5.4 5c2.5-2.4-.8-3.1 1.2-5.2"/><path d="M5 14c0-2 4-5 11-5s11 3 11 5" fill={cream}/><path d="M4 14h24l-1.2 9c-.5 3.2-4.1 5-10.8 5s-10.3-1.8-10.8-5Z" fill={gold}/><path d="M11 28v1m10-1v1M12 18h8"/><ellipse cx="16" cy="22" rx="2.6" ry="1.8" fill={cream}/></>,
  rosette: <><path d="m11 19-4 10 5-2 2 2 3-9m1-1 2.7 10 2.8-2.7 3.4 1.1-3.8-10" fill={rose}/><path fill="var(--stamp-fill, #e9bd62)" d="m16 2 3.2 1.6 3.6.4 1.7 3.2 2.6 2.4-.7 3.5.2 3.6-2.9 2.1-2.2 2.9-3.6-.2-3.5.7-2.4-2.6-3.2-1.7-.4-3.6L6.8 11l2-3 1-3.4 3.6-.8Z"/><path d="M12.8 15.4c-.8-2 1-6 6.5-7.1.6 4.8-2.8 8.1-6.5 7.1Z" fill={cream}/><path d="m13.7 14.4 2.4-2.7"/></>,
  sprout: <><path d="M5 25q10-5 22 0" fill={gold}/><path d="M16 24c0-7-2-11-6-13m6 13c0-9 1-13 7-18"/><path d="M15 16C7 18 4 13 4 8c6-1 11 1 11 8Zm2-3C16 6 21 3 28 4c-1 6-4 10-11 9Z" fill={leaf}/></>,
  gift: <><rect x="5" y="13" width="22" height="14" rx="2.5" fill={cream}/><path fill={gold} d="M3 10h26v5H3zM13.5 10h5v17h-5z"/><path d="M16 10C6.5 10 7 2.3 11 3.1c3 .6 5 6.9 5 6.9Zm0 0c9.5 0 9-7.7 5-6.9-3 .6-5 6.9-5 6.9Z" fill={rose}/></>,
  scarf: <><path d="m8 12 8 5-4 12-6-3z" fill={gold}/><path d="M7 7q9-5 18 0l-1 7q-9 7-18-1z" fill={rose}/><path d="m16 17 6-3 5 10-6 3z" fill={rose}/><path d="m7.8 23 4.5 2.2m8.8-3 4-2M9 9q7 3 13-.4"/></>,
  leaf: <><path d="M5 23C2 13 13 6 27 4c1 12-7 25-20 22Z" fill="#d9a166"/><path d="M4 29 22 10m-8 9 7-1m-8 2 .3-6"/></>,
  butterfly: <><path d="M15 16C7 3 1 7 4 14c.9 2.8 4.3 4.5 8 4.5-6 0-5 7.5-1.4 6.7 2.4-.5 4.3-3.6 5.4-6.7 2.5 8 7 9 8 5 .7-2.4-1.5-4.1-4.3-5.2 8.3 1 11-9 7.2-10.6-3.7-1.8-8.7 4.9-11.9 8.3Z" fill={gold}/><path d="m15.8 16.7.8 5.3m-.5-6-2-5m2.2 5 2-5"/></>,
  seed: <><path d="M9 25C4 19 12 8 23 5c3 8-1 19-11 21Z" fill={cream}/><path d="M12 22q2-6 7-11"/></>,
  riceball: <><path d="M12.8 6q3-4 6 0l9 15q2.9 6-3.6 6H7.8q-6.4 0-3.5-6Z" fill={cream}/><path d="M12 20h8v7h-8Z" fill={leaf}/><path d="m12 13 1.4-1m7.8 3.2-1-1"/></>,
  bento: <><rect x="3" y="8" width="26" height="19" rx="5" fill={gold}/><rect x="6" y="11" width="20" height="13" rx="3" fill={cream}/><path d="M17 11v13m0-6h9"/><ellipse cx="11" cy="17" rx="2.2" ry="2.2" fill={rose}/></>,
  crown: <><path d="m3 10 7 4.4 6-9 6 9 7-4.4-3 15H6Z" fill={gold}/><path d="M8 21h16"/><path d="M14 15c0-2 3.2-3.3 5-3-.2 3.7-2.5 5.3-4.3 4.5Z" fill={leaf}/></>,
  settings: <><path d="M4 9h24M4 23h24"/><ellipse transform="rotate(18 11 9)" cx="11" cy="9" rx="3.1" ry="5" fill={leaf}/><ellipse transform="rotate(18 21 23)" cx="21" cy="23" rx="3.1" ry="5" fill={gold}/></>,
  sparkle: <path d="M16 3q1 11 11 13-10 2-11 13Q14 18 5 16 14 14 16 3Z" fill={cream}/>,
} satisfies Record<string, ReactNode>;

export function TrailSymbol({ kind, rank }: { kind: keyof typeof marks; rank?: number }) {
  return <svg aria-hidden="true" focusable="false" data-trail-symbol={kind} data-rank={rank}
    width="1.2em" height="1.2em" viewBox="0 0 32 32" fill="none" stroke="#584638" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    {marks[kind]}
  </svg>;
}
