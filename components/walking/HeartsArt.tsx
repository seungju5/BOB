/**
 * [EN] 3D-shaded storybook accessories and animated park trail wonders for Bapmunna Walking Hearts.
 * [KR] 밥뭇나 산책 하트용 입체 동화풍 꾸미기 액세서리 및 살아 움직이는 산책길 풍경 컴포넌트입니다.
 */
import type {HeartEquipment,HeartSummary} from '@/packages/walking-hearts/core.mjs';

export function WearDefs(){
  return <defs>
    <filter id="plush-shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="0.45" stdDeviation="0.55" floodColor="#3b2614" floodOpacity="0.28"/>
    </filter>
    <linearGradient id="crown-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#fff6b3"/><stop offset="48%" stopColor="#f8c63a"/><stop offset="100%" stopColor="#c98210"/>
    </linearGradient>
    <linearGradient id="crown-rim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#cf8812"/><stop offset="50%" stopColor="#ffe98a"/><stop offset="100%" stopColor="#c47c0e"/>
    </linearGradient>
    <radialGradient id="pearl-glow" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stopColor="#ffffff"/><stop offset="65%" stopColor="#fff3d9"/><stop offset="100%" stopColor="#dcb984"/>
    </radialGradient>
    <radialGradient id="ruby-gem" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stopColor="#ff9eab"/><stop offset="55%" stopColor="#e63956"/><stop offset="100%" stopColor="#8f162a"/>
    </radialGradient>
    <radialGradient id="emerald-gem" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stopColor="#a4f7d3"/><stop offset="60%" stopColor="#24a36e"/><stop offset="100%" stopColor="#125e3f"/>
    </radialGradient>
    <radialGradient id="sapphire-gem" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stopColor="#addbff"/><stop offset="60%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#1d4ed8"/>
    </radialGradient>
    <linearGradient id="straw-dome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#fff2bf"/><stop offset="55%" stopColor="#edd07b"/><stop offset="100%" stopColor="#c6993e"/>
    </linearGradient>
    <linearGradient id="straw-brim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#caa046"/><stop offset="50%" stopColor="#f7df97"/><stop offset="100%" stopColor="#c3953c"/>
    </linearGradient>
    <linearGradient id="ribbon-sage" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#89ba75"/><stop offset="100%" stopColor="#4c7f3d"/>
    </linearGradient>
    <linearGradient id="cap-mint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#9cdbc3"/><stop offset="60%" stopColor="#5ca68c"/><stop offset="100%" stopColor="#3b7862"/>
    </linearGradient>
    <linearGradient id="vest-sage" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#9cb880"/><stop offset="65%" stopColor="#728e58"/><stop offset="100%" stopColor="#51683b"/>
    </linearGradient>
    <linearGradient id="hanbok-silk" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#ffc8d2"/><stop offset="55%" stopColor="#f18fa2"/><stop offset="100%" stopColor="#c96276"/>
    </linearGradient>
    <linearGradient id="scarf-coral" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#ff9f7f"/><stop offset="55%" stopColor="#e36545"/><stop offset="100%" stopColor="#b03f24"/>
    </linearGradient>
    <linearGradient id="basket-rattan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#eec682"/><stop offset="60%" stopColor="#c89147"/><stop offset="100%" stopColor="#915f22"/>
    </linearGradient>
  </defs>;
}

/**
 * [EN] Renders soft 3D storybook outfits and accessories in exact 1:1 coordinate lock with the bunny rig.
 * [KR] 토끼 리그(rig) 좌표계(34.69..64.20, 34.69..84.13)에 1:1로 맞물리는 입체 동화풍 액세서리를 렌더링합니다.
 */
export function BunnyWearOverlay({equipped}:{equipped:HeartEquipment}){
  return <svg className="hearts-clothes" viewBox="34.69 34.69 29.51 49.44" aria-hidden="true">
    <WearDefs/>
    {equipped.outfit==='vest'?<g filter="url(#plush-shadow)">
      <path d="M44 71.2 Q48 69.8 51.2 72.8 Q54.5 69.8 57.8 71.2 L59.6 81.8 Q51.5 84.4 42.8 81.5 Z" fill="url(#vest-sage)" stroke="#4c6238" strokeWidth="0.45" strokeLinejoin="round"/>
      <path d="M46.8 70.8 L51.2 74.8 L55.4 70.8" fill="none" stroke="#fff9eb" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M46 74.2 L45.2 80.5 M56.2 74.2 L57 80.5" stroke="#89a46d" strokeWidth="0.4" strokeDasharray="0.9 0.9" strokeLinecap="round"/>
      <rect x="50.3" y="75.6" width="2.1" height="1.1" rx="0.55" fill="#6b4423" stroke="#fff3d6" strokeWidth="0.2"/>
      <rect x="50.3" y="78.6" width="2.1" height="1.1" rx="0.55" fill="#6b4423" stroke="#fff3d6" strokeWidth="0.2"/>
    </g>:null}
    {equipped.outfit==='hanbok'?<g filter="url(#plush-shadow)">
      <path d="M43.2 71.2 Q47.5 69.5 51.5 72.6 Q55.5 69.5 59.2 71.2 L61.2 82.2 Q51.5 85.2 41.8 81.8 Z" fill="url(#hanbok-silk)" stroke="#b3586b" strokeWidth="0.45" strokeLinejoin="round"/>
      <path d="M46.5 70.5 L51.5 74.8 L56.5 70.5" fill="none" stroke="#fff7df" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M51 74.5 Q53.8 73.5 55 75 Q53.4 76.2 51 75 Z" fill="url(#scarf-coral)"/>
      <path d="M51.2 74.8 Q49.8 79.5 48.4 82.2 M52.4 74.9 Q54.2 79.5 55.6 82" fill="none" stroke="url(#scarf-coral)" strokeWidth="1.05" strokeLinecap="round"/>
      <circle cx="46.2" cy="78.2" r="0.85" fill="#fff4c7"/><circle cx="56.8" cy="77.5" r="0.85" fill="#fff4c7"/>
    </g>:null}
    {equipped.accessory==='scarf'?<g filter="url(#plush-shadow)">
      <path d="M42.8 68.4 Q51.5 72.4 59.6 68.2 Q60.6 70.2 58.8 72 Q51.5 75.2 43.4 72 Q41.8 70.2 42.8 68.4 Z" fill="url(#scarf-coral)" stroke="#9e3920" strokeWidth="0.42"/>
      <path d="M45 70.1 Q51.5 72.6 57.8 69.9" fill="none" stroke="#ffd8b8" strokeWidth="0.52" strokeDasharray="1.2 1.2" strokeLinecap="round"/>
      <g className="hearts-scarf-tail">
        <path d="M45.8 71.2 Q44.2 76.8 45.2 79.8 L49 79.5 Q49.4 76 48.6 72 Z" fill="url(#scarf-coral)" stroke="#9e3920" strokeWidth="0.38"/>
        <path d="M45.5 79.8 L45.2 81.3 M47.1 79.8 L47 81.4 M48.6 79.6 L48.8 81.2" stroke="#fff2d9" strokeWidth="0.55" strokeLinecap="round"/>
      </g>
    </g>:null}
    {equipped.accessory==='basket'?<g filter="url(#plush-shadow)" className="hearts-basket-sway">
      <path d="M58.2 76.5 Q61.2 70.5 65 76.2" fill="none" stroke="#8c5820" strokeWidth="1.05" strokeLinecap="round"/>
      <path d="M56.8 76.2 Q61.6 75.1 66.4 76.2 L65.5 79.2 Q61.6 80.2 57.5 79.2 Z" fill="#f26d6d" stroke="#b84343" strokeWidth="0.35"/>
      <path d="M57.3 77.4 L65.8 77.4" stroke="#fff8eb" strokeWidth="0.52" strokeDasharray="1.1 1.1"/>
      <path d="M57.3 78 L66 78 L64.9 83.8 Q61.6 85 58.2 83.8 Z" fill="url(#basket-rattan)" stroke="#7d4e1b" strokeWidth="0.42" strokeLinejoin="round"/>
      <path d="M58 80 Q61.6 80.9 65.2 80 M58.3 82 Q61.6 82.8 64.9 82 M60.3 78.2 L60.5 84 M63 78.2 L62.8 84" fill="none" stroke="#7d4e1b" strokeWidth="0.35" opacity="0.65"/>
      <circle cx="60.1" cy="75.6" r="1.05" fill="#fffdf5"/><circle cx="60.1" cy="75.6" r="0.42" fill="#f7c538"/>
      <circle cx="63.3" cy="75.8" r="1.1" fill="#e63956"/>
    </g>:null}
    {equipped.hat==='straw-hat'?<g filter="url(#plush-shadow)">
      <ellipse cx="51" cy="52.4" rx="13.8" ry="3.4" fill="url(#straw-brim)" stroke="#a6792b" strokeWidth="0.45"/>
      <path d="M41.8 51.8 Q42.8 44.2 51 44.2 Q59.2 44.2 60.2 51.8 Q51 53.9 41.8 51.8 Z" fill="url(#straw-dome)" stroke="#a6792b" strokeWidth="0.45"/>
      <path d="M43.8 47.9 Q51 46.5 58.2 47.9 M44.8 46 Q51 44.9 57.2 46" fill="none" stroke="#c89b43" strokeWidth="0.35" strokeDasharray="1.1 0.9"/>
      <path d="M42 50.3 Q51 52.4 60 50.3 L60.2 51.9 Q51 54 41.8 51.9 Z" fill="url(#ribbon-sage)"/>
      <path d="M44.3 51 C41.8 49.4 41.8 52.8 44.3 51.6 C46.8 52.8 46.8 49.4 44.3 51 Z" fill="#689f54" stroke="#3e6b2f" strokeWidth="0.35"/>
      <path d="M43.8 51.6 L42.1 54.6 M44.8 51.6 L44.1 54.9" stroke="#5c9148" strokeWidth="0.82" strokeLinecap="round"/>
      <circle cx="44.3" cy="51.2" r="1.05" fill="#fffdf7"/><circle cx="44.3" cy="51.2" r="0.48" fill="#f7c538"/>
    </g>:null}
    {equipped.hat==='hiking-cap'?<g filter="url(#plush-shadow)">
      <path d="M41.2 52.1 Q41.8 43.4 51.2 43.6 Q59.4 43.8 60 51.6 Q51 53.4 41.2 52.1 Z" fill="url(#cap-mint)" stroke="#316853" strokeWidth="0.45"/>
      <path d="M51 43.6 Q47.2 47.4 46.7 52.1 M51 43.6 Q54.8 47.4 55.3 51.9" fill="none" stroke="#b9ead8" strokeWidth="0.38" opacity="0.7"/>
      <circle cx="51" cy="43.5" r="0.9" fill="#fff5d6" stroke="#316853" strokeWidth="0.35"/>
      <path d="M48 51 Q57.8 49.4 63.5 52.1 Q58.5 54.8 47 52.4 Z" fill="#468970" stroke="#2d5e4b" strokeWidth="0.42"/>
      <circle cx="51" cy="48.4" r="1.55" fill="#fff8e3" stroke="#d49b2a" strokeWidth="0.35"/>
      <path d="M51 47.4 L51.5 48.4 L50.5 48.4 Z" fill="#4f8240"/>
    </g>:null}
    {equipped.hat==='crown'?<g filter="url(#plush-shadow)">
      <path d="M44.2 51.6 Q45.8 46.1 51 46.1 Q56.2 46.1 57.8 51.6 Z" fill="#d94b64" opacity="0.92"/>
      <path d="M42.8 51.9 L41.5 45.4 L46.3 48.7 L51 42.6 L55.7 48.7 L60.5 45.4 L59.2 51.9 Q51 53.6 42.8 51.9 Z" fill="url(#crown-gold)" stroke="#9e6308" strokeWidth="0.48" strokeLinejoin="round"/>
      <path d="M42.8 50.9 Q51 52.6 59.2 50.9 L59 52.4 Q51 54.1 43 52.4 Z" fill="url(#crown-rim)" stroke="#9e6308" strokeWidth="0.38"/>
      <circle cx="41.5" cy="45" r="1.08" fill="url(#pearl-glow)" stroke="#b37410" strokeWidth="0.3"/>
      <circle cx="46.3" cy="48.2" r="0.86" fill="url(#pearl-glow)" stroke="#b37410" strokeWidth="0.28"/>
      <circle cx="51" cy="42.1" r="1.3" fill="url(#pearl-glow)" stroke="#b37410" strokeWidth="0.34"/>
      <circle cx="55.7" cy="48.2" r="0.86" fill="url(#pearl-glow)" stroke="#b37410" strokeWidth="0.28"/>
      <circle cx="60.5" cy="45" r="1.08" fill="url(#pearl-glow)" stroke="#b37410" strokeWidth="0.3"/>
      <path d="M51 50.6 C50.2 49.8 49.3 48.8 49.8 47.9 C50.3 47.3 51 47.8 51 48.2 C51 47.8 51.7 47.3 52.2 47.9 C52.7 48.8 51.8 49.8 51 50.6 Z" fill="url(#ruby-gem)" stroke="#fff2c2" strokeWidth="0.26"/>
      <circle cx="46" cy="50.2" r="0.94" fill="url(#emerald-gem)" stroke="#fff2c2" strokeWidth="0.26"/>
      <circle cx="56" cy="50.2" r="0.94" fill="url(#sapphire-gem)" stroke="#fff2c2" strokeWidth="0.26"/>
      <circle cx="50.5" cy="48.3" r="0.28" fill="#ffffff"/>
      <g className="hearts-crown-sparkles" fill="#fff9d2">
        <path d="M38.2 42.8 L38.7 44.1 L40 44.6 L38.7 45.1 L38.2 46.4 L37.7 45.1 L36.4 44.6 L37.7 44.1 Z"/>
        <path d="M63 42.1 L63.4 43.1 L64.5 43.6 L63.4 44.1 L63 45.1 L62.6 44.1 L61.5 43.6 L62.6 43.1 Z"/>
      </g>
    </g>:null}
  </svg>;
}

/**
 * [EN] Renders animated roadside wonders and ambient nature elements along the walking trail.
 * [KR] 이동하는 산책길 주변의 신기하고 다정한 자연·안부 요소들을 조화롭게 렌더링합니다.
 */
export function ParkTrailWonders({summary,compact=false}:{summary?:HeartSummary;compact?:boolean}){
  const cooking=Boolean(summary?.cooking);
  const pct=summary?.percent??0;
  return <div className="hearts-wonders" aria-hidden="true">
    <div className="hearts-sunbeams"/>
    <div className="hearts-cloud hearts-cloud-a"/>
    <div className="hearts-cloud hearts-cloud-b"/>
    {!compact?<div className="hearts-sky-bird"><span>🐦</span><i className="hearts-bird-note">♪</i></div>:null}
    <div className="hearts-ground-stream">
      <div className="hearts-ground-belt">
        <span className="hearts-pebble"/>
        <span className="hearts-tuft">🍀</span>
        <span className={`hearts-landmark ${cooking?'is-lit':''}`} title="따뜻한 밥김 쉼터">🍚<i>♥</i></span>
        <span className="hearts-pebble is-warm"/>
        <span className="hearts-tuft">🌼</span>
        <span className={`hearts-landmark ${pct>=25?'is-lit':''}`} title="도토리 다람쥐">🐿️</span>
        <span className="hearts-pebble"/>
        <span className="hearts-tuft">🌱</span>
        <span className={`hearts-landmark ${pct>=50?'is-lit':''}`} title="산책길 우체통">📮<i>💌</i></span>
        <span className="hearts-pebble is-warm"/>
        <span className="hearts-tuft">🌷</span>
        <span className={`hearts-landmark ${pct>=100?'is-lit':''}`} title="꽃길 바람개비">🎡<i>✨</i></span>
        <span className="hearts-pebble"/>
        <span className="hearts-tuft">🍀</span>
        <span className={`hearts-landmark ${cooking?'is-lit':''}`}>🍚<i>♥</i></span>
        <span className="hearts-pebble is-warm"/>
        <span className="hearts-tuft">🌼</span>
        <span className={`hearts-landmark ${pct>=25?'is-lit':''}`}>🐿️</span>
        <span className="hearts-pebble"/>
        <span className="hearts-tuft">🌱</span>
        <span className={`hearts-landmark ${pct>=50?'is-lit':''}`}>📮<i>💌</i></span>
        <span className="hearts-pebble is-warm"/>
        <span className="hearts-tuft">🌷</span>
        <span className={`hearts-landmark ${pct>=100?'is-lit':''}`}>🎡<i>✨</i></span>
      </div>
    </div>
    <span className="hearts-butterfly hearts-butterfly-a">🦋</span>
    <span className="hearts-butterfly hearts-butterfly-b">🦋</span>
    <span className="hearts-dandelion hearts-dandelion-a">✦</span>
    <span className="hearts-dandelion hearts-dandelion-b">❀</span>
  </div>;
}
