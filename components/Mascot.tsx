type Mood = "happy" | "wink" | "sleepy" | "worried";

/** 밥솥이 — 밥뭇나의 밥솥 캐릭터 */
export function Mascot({ mood = "happy", className = "" }: { mood?: Mood; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="밥솥이">
      {/* 김 */}
      <path d="M78 34c-8-10 8-14 0-24M100 30c-8-10 8-14 0-24M122 34c-8-10 8-14 0-24" stroke="#d9c9a8" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* 뚜껑 */}
      <ellipse cx="100" cy="66" rx="70" ry="20" fill="#fffcf3" stroke="#3b2a1e" strokeWidth="5" />
      <rect x="86" y="40" width="28" height="16" rx="8" fill="#3b2a1e" />
      {/* 몸통 */}
      <path d="M30 72c0 58 26 100 70 100s70-42 70-100" fill="#fffcf3" stroke="#3b2a1e" strokeWidth="5" />
      <path d="M44 150q56 22 112 0" stroke="#f6cd48" strokeWidth="10" fill="none" strokeLinecap="round" />
      {/* 볼 */}
      <circle cx="62" cy="122" r="9" fill="#f4b6a3" />
      <circle cx="138" cy="122" r="9" fill="#f4b6a3" />
      <Face mood={mood} />
    </svg>
  );
}

function Face({ mood }: { mood: Mood }) {
  const eye = { fill: "#3b2a1e" };
  const line = { stroke: "#3b2a1e", strokeWidth: 5, fill: "none", strokeLinecap: "round" as const };
  switch (mood) {
    case "wink":
      return (
        <>
          <circle cx="78" cy="104" r="7" {...eye} />
          <path d="M114 104q8-8 16 0" {...line} />
          <path d="M88 126q12 12 24 0" {...line} />
        </>
      );
    case "sleepy":
      return (
        <>
          <path d="M70 106q8 6 16 0M114 106q8 6 16 0" {...line} />
          <ellipse cx="100" cy="128" rx="6" ry="4" fill="#3b2a1e" />
        </>
      );
    case "worried":
      return (
        <>
          <circle cx="78" cy="106" r="7" {...eye} />
          <circle cx="122" cy="106" r="7" {...eye} />
          <path d="M68 92l14 4M132 92l-14 4" {...line} />
          <path d="M90 132q10-8 20 0" {...line} />
        </>
      );
    default:
      return (
        <>
          <circle cx="78" cy="104" r="7" {...eye} />
          <circle cx="122" cy="104" r="7" {...eye} />
          <path d="M88 124q12 12 24 0" {...line} />
        </>
      );
  }
}

/** 로고: 밥솥 아이콘 + 손글씨 이름 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
        <ellipse cx="20" cy="15" rx="15" ry="5" fill="#fffcf3" stroke="#3b2a1e" strokeWidth="2.5" />
        <path d="M5 16c0 12 6 19 15 19s15-7 15-19" fill="#f6cd48" stroke="#3b2a1e" strokeWidth="2.5" />
        <circle cx="15" cy="24" r="1.8" fill="#3b2a1e" />
        <circle cx="25" cy="24" r="1.8" fill="#3b2a1e" />
        <rect x="17" y="8" width="6" height="4" rx="2" fill="#3b2a1e" />
      </svg>
      <span className="font-hand text-[26px] leading-none text-cocoa">밥뭇나</span>
    </span>
  );
}
