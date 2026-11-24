"use client";

import { useEffect, useRef, useState } from "react";
import { appPath } from "@/lib/app-path";
import { Mascot } from "@/components/Mascot";
import { createBunnyGreeting } from "./bunny/bunny-greeting.mjs";
import { WARMING_REACTIONS } from "./bunny/bunny-reactions.mjs";
import "./bunny/bunny-greeting.css";

type Reaction = keyof typeof WARMING_REACTIONS;
const reactions: Reaction[] = ['wave', 'curious', 'cheer', 'bow', 'rest'];

/** Tapping tells a short story; the original welcome and every entry link stay immediate. */
export function BunnyGreeting({ className = "", autoPlay = true }: { className?: string; autoPlay?: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
  const greeting = useRef<ReturnType<typeof createBunnyGreeting> | null>(null);
  const hideReply = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextReaction = useRef(0);
  const [reply, setReply] = useState('');
  const [reaction, setReaction] = useState<Reaction>('wave');

  useEffect(() => {
    if (!scene.current) return;
    const controller = createBunnyGreeting(scene.current, {imageUrl: appPath("/brand/bunny.png"), underlayUrl: appPath("/brand/bunny-underlay.webp")});
    greeting.current = controller;
    if (autoPlay) void controller.play();
    return () => {
      clearTimeout(hideReply.current);
      controller.dispose();
      greeting.current = null;
    };
  }, [autoPlay]);

  function greet() {
    const next = reactions[nextReaction.current++ % reactions.length];
    void greeting.current?.play(next);
    setReaction(next);
    setReply(WARMING_REACTIONS[next].reply);
    clearTimeout(hideReply.current);
    hideReply.current = setTimeout(() => setReply(''), 3200);
  }

  return (
    <div ref={scene} className={`warming-greeting ${className}`} data-reaction={reaction} data-reply={Boolean(reply)}>
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
      <span className="warming-reaction-mark" aria-hidden="true">{reaction === 'cheer' ? '♥' : reaction === 'curious' ? '?' : reaction === 'rest' ? '· · ·' : ''}</span>
      <span role="status" className={reply ? 'warming-reply' : 'sr-only'}>
        {reply}
      </span>
    </div>
  );
}
