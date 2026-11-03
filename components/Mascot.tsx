import Image from "next/image";

type Mood = "happy" | "wink" | "sleepy" | "worried";

/** The original 3D bunny is a companion, never a meal or health indicator. */
export function Mascot({ className = "" }: { mood?: Mood; className?: string }) {
  return <Image src="/brand/bunny.png" width={480} height={480} unoptimized alt="초록 가디건을 입은 밥뭇나 토끼" className={`object-contain ${className}`} />;
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image src="/brand/rice-logo.png" width={44} height={44} unoptimized alt="" className="h-11 w-11 object-contain" />
      <span className="font-hand text-[35px] leading-none text-cocoa">밥뭇나</span>
    </span>
  );
}
