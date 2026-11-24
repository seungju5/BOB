"use client";

import { useEffect, useRef, useState } from "react";
import { appPath } from "@/lib/app-path";
import { Mascot } from "@/components/Mascot";
import { createBunnyGreeting } from "./bunny/bunny-greeting.mjs";
import "./bunny/bunny-greeting.css";

export function BunnyGreeting({ className = "" }: { className?: string }) {
  const scene = useRef<HTMLDivElement>(null);
  const greeting = useRef<ReturnType<typeof createBunnyGreeting> | null>(null);
  const hideReply = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [replyVisible, setReplyVisible] = useState(false);

  useEffect(() => {
    if (!scene.current) return;
    const controller = createBunnyGreeting(scene.current, {imageUrl: appPath("/brand/bunny.png"), underlayUrl: appPath("/brand/bunny-underlay.webp")});
    greeting.current = controller;
    void controller.play();
    return () => {
      clearTimeout(hideReply.current);
      controller.dispose();
      greeting.current = null;
    };
  }, []);

  function greet() {
    void greeting.current?.play();
    setReplyVisible(true);
    clearTimeout(hideReply.current);
    hideReply.current = setTimeout(() => setReplyVisible(false), 2600);
  }

  return (
    <div ref={scene} className={className}>
      <button
        type="button"
        aria-label="토끼에게 인사하기"
        className="absolute inset-0 cursor-pointer rounded-3xl focus-visible:outline-3 focus-visible:outline-cocoa"
        onClick={greet}
      >
        <span className="bunny-slot bunny-stage absolute inset-0" aria-hidden="true">
          <span className="bunny-shadow" />
          <Mascot variant="bunny" className="h-full w-full" />
        </span>
      </button>
      <span role="status" className={replyVisible
        ? "pointer-events-none absolute right-0 -bottom-3 rounded-full bg-paper px-3 py-1 text-base font-semibold text-cocoa"
        : "sr-only"}>
        {replyVisible ? "반가워요!" : ""}
      </span>
    </div>
  );
}
