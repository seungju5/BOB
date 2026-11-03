"use client";

import { useEffect, useRef } from "react";
import { Mascot } from "@/components/Mascot";
import { createBunnyGreeting } from "@/integrations/bapmunna-firebase/docs/bunny-greeting.mjs";
import "@/integrations/bapmunna-firebase/docs/bunny-greeting.css";

/** Only the welcome screen performs the finite, decorative greeting. */
export function BunnyGreeting({ className = "" }: { className?: string }) {
  const scene = useRef<HTMLDivElement>(null);
  const greeting = useRef<ReturnType<typeof createBunnyGreeting> | null>(null);
  useEffect(() => {
    if (!scene.current) return;
    const controller = createBunnyGreeting(scene.current, {spriteUrl: "/brand/bunny-greeting.webp"});
    greeting.current = controller;
    void controller.play();
    return () => { controller.dispose(); greeting.current = null; };
  }, []);

  return (
    <div ref={scene} className={className}>
      <div className="bunny-slot bunny-stage absolute inset-0">
        <span className="bunny-shadow" aria-hidden="true" />
        <Mascot className="h-full w-full" />
      </div>
      <button type="button" className="welcome-replay absolute right-0 -bottom-4 min-h-11 rounded-full px-3 text-xs text-cocoa"
        data-action="welcome-replay" aria-label="토끼의 점프와 손 인사 다시 보기" onClick={() => void greeting.current?.play()}>
        <span aria-hidden="true">↻ </span>다시 인사하기
      </button>
    </div>
  );
}
