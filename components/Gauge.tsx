"use client";

import type { ComponentProps, CSSProperties } from "react";
import styles from "./Gauge.module.css";

export function vibrateOnSelection() {
  if (typeof navigator.vibrate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(12);
  } catch {
    // Embedded browsers can expose this API while blocking vibration.
  }
}

type GaugeProps = Omit<ComponentProps<"input">, "type" | "value" | "defaultValue" | "min" | "max" | "step" | "onChange"> & {
  value: number;
  min: number;
  max: number;
  step?: number;
  haptic?: boolean;
  onChange: (value: number) => void;
};

export function Gauge({ value, min, max, step = 1, haptic = true, onChange, className = "", style, ...props }: GaugeProps) {
  const progress = max > min ? Math.min(100, Math.max(0, (value - min) / (max - min) * 100)) : 0;
  return (
    <input {...props} type="range" value={value} min={min} max={max} step={step}
      className={`${styles.input} ${className}`}
      style={{ ...style, "--progress": `${progress}%` } as CSSProperties}
      onChange={event => {
        const next = event.currentTarget.valueAsNumber;
        onChange(next);
        if (haptic && next !== value) vibrateOnSelection();
      }}
    />
  );
}
