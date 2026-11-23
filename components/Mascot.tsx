import Image from "next/image";
import { appPath } from "@/lib/app-path";

type Mood = "happy" | "wink" | "sleepy" | "worried";

/** The cover greets with the bunny; Bapsoti accompanies every following screen. */
export function Mascot({ className = "", variant = "cooker" }: { mood?: Mood; className?: string; variant?: "cooker" | "bunny" }) {
  const bunny = variant === "bunny";
  return <Image src={appPath(`/brand/${bunny ? "bunny.png" : "rice-cooker-companion.png"}`)} width={bunny ? 480 : 1254} height={bunny ? 480 : 1254} unoptimized loading="eager" alt={bunny ? "초록 가디건을 입은 밥뭇나 토끼" : "안부를 전하는 귀여운 밥솥이"} className={`object-contain ${className}`} />;
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image src={appPath("/brand/rice-logo.png")} width={44} height={44} unoptimized alt="" className="h-11 w-11 object-contain" />
      <span className="font-hand text-[35px] leading-none text-cocoa">밥뭇나</span>
    </span>
  );
}
