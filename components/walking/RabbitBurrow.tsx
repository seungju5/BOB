"use client";

import { useId } from "react";
import { WARMING_RABBIT_ART } from "@/components/Mascot";
import "./rabbit-burrow.css";

export function RabbitBurrow() {
  const id = useId();
  const paint = (part: string) => `url(#${id}-${part})`;
  return <svg className="rabbit-burrow-art" viewBox="0 0 90 76" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={id + "-rim"}><path d="M0 0h90v47H76C73 57 62 65 44 65S18 58 13 49H0Z"/></clipPath>
      <radialGradient id={id + "-earth"} cx=".5" cy=".8" r=".9"><stop stopColor="#74543b"/><stop offset=".75" stopColor="#3a2e27"/><stop offset="1" stopColor="#503b2b"/></radialGradient>
      <radialGradient id={id + "-paw"} cx=".38" cy=".26" r=".8"><stop stopColor="#fffbf0"/><stop offset=".55" stopColor="#f7e9d5"/><stop offset="1" stopColor="#d2b89b"/></radialGradient>
    </defs>
    <ellipse cx="44" cy="69" rx="26" ry="3.2" fill="#8c7052" opacity=".15"/>
    <ellipse cx="44" cy="45" rx="33" ry="26" fill="#705139"/>
    <ellipse cx="44" cy="43.5" rx="31.7" ry="24.4" fill={paint("earth")}/>
    <g clipPath={paint("rim")}><image className="rabbit-burrow-face" href={WARMING_RABBIT_ART} x="-5" y="6" width="103" height="103"/></g>
    <ellipse cx="26" cy="61.7" rx="6.2" ry="5.1" transform="rotate(15 26 61.7)" fill={paint("paw")}/>
    <ellipse cx="61.5" cy="61.7" rx="6.2" ry="5.1" transform="rotate(-15 61.5 61.7)" fill={paint("paw")}/>
    <g stroke="#5a4030" strokeWidth="2.8" strokeLinecap="round"><path d="m74 11 1.8-5.6m4.4 9.2 4.6-4.4m-2.3 10.5 5.4-1.6"/></g>
  </svg>;
}
