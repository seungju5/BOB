import Image from "next/image";
import cooker from "@/integrations/bapmunna-firebase/docs/assets/rice-cooker-companion.png";

const ART = [
  "/brand/meal-cooker/cooker-one-meal.png",
  "/brand/meal-cooker/cooker-two-meals.png",
  "/brand/meal-cooker/cooker-three-meals-bunny.png",
];

/** The rice level represents the number of recorded meal signals. */
export function RiceFill({ count, className = "" }: { count: number | null; className?: string }) {
  const art = count && count > 0 ? ART[Math.min(count, 3) - 1] : undefined;
  if (art) {
    const full = count === 3;
    return (
      <span role="img" aria-label={`끼니 소식 ${count}개`} className={`relative inline-block overflow-hidden ${className}`}>
        {full && <Image src={cooker} alt="" fill sizes="64px" className="scale-[1.6] object-contain" />}
        <Image src={art} alt="" fill sizes="64px" className={`scale-[1.6] object-contain ${full ? "rice-fill-ears" : "rice-fill-level"}`} />
      </span>
    );
  }
  return (
    <svg viewBox="0 0 100 88" role="img" aria-label="아직 확인할 끼니 소식이 없어요" className={className}>
      <path d="M21 44C12 40 10 33 17 26 30 13 46 8 64 8c10 0 15 6 13 13-5 12-34 22-56 23Z" fill="#fbefd7" stroke="#5b3921" strokeWidth="2.3" />
      <path d="M39 12c0-4 8-7 12-4l2 2" fill="#f5ca61" stroke="#5b3921" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 52c-8-1-8 12 4 12m65-12c8-1 8 12-4 12" fill="#f6d878" stroke="#5b3921" strokeWidth="2.3" />
      <path d="M26 75q-1 9 8 7l5-5m22 0 5 5q9 2 8-7" fill="#f6d878" stroke="#5b3921" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M16 48c0-12 14-18 34-18s34 6 34 18l-3 18c-3 9-12 12-31 12S22 75 19 66Z" fill="#fff4df" stroke="#5b3921" strokeWidth="2.4" />
      <ellipse cx="50" cy="43" rx="27" ry="10" fill="#dfbb87" stroke="#5b3921" strokeWidth="2.2" />
      <path d="M45 65q5 5 10 0" fill="none" stroke="#5b3921" strokeWidth="2" strokeLinecap="round" />
      <circle cx="39" cy="62" r="2.1" fill="#5b3921" /><circle cx="61" cy="62" r="2.1" fill="#5b3921" />
      <ellipse cx="35" cy="66" rx="3.4" ry="2" fill="#efb69f" /><ellipse cx="65" cy="66" rx="3.4" ry="2" fill="#efb69f" />
    </svg>
  );
}
