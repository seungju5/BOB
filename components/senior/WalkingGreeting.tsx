"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WARMING_RABBIT_ART } from "@/components/Mascot";
import { dailyEncouragement } from "./messages";

type GreetingProps = { today: string; demo: boolean };

function Greeting({ today, demo, below = false }: GreetingProps & { below?: boolean }) {
  return <section className="walking-greeting" data-placement={below ? "below" : "left"} aria-label="워밍이의 오늘 한마디">
    <p className="walking-greeting-bubble">{dailyEncouragement(today)}</p>
    <Link className="walking-greeting-rabbit" href={demo ? "/walking/demo/" : "/walking/#trail"} aria-label="워밍이와 산책하기">
      <Image src={WARMING_RABBIT_ART} alt="" width={480} height={480} unoptimized loading="eager" />
      <span>산책하기 <span aria-hidden="true">›</span></span>
    </Link>
  </section>;
}

function GreetingPlacement(props: GreetingProps) {
  const params = useSearchParams();
  return <Greeting {...props} below={params.get("bubble") === "below"} />;
}

export function WalkingGreeting(props: GreetingProps) {
  return <Suspense fallback={<Greeting {...props} />}><GreetingPlacement {...props} /></Suspense>;
}
