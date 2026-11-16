'use client';

import { within } from './bridge';

export type SmartThingsConnection = {
  stage: 'disconnected' | 'choose_device' | 'subscribing' | 'connected' | 'reconnect_required';
  device?: { id: string; label: string } | null;
  lastSignalAt?: number | null;
  lastReceivedAt?: number | null;
  lastCheckedAt?: number | null;
};

type SmartThingsModule = {
  mountSmartThings(element: HTMLElement, options: {
    accountHref: string; homeHref: string; homeLabel: string; consentHref: string;
    onConnection: (uid: string, connection: SmartThingsConnection) => void;
  }): () => void;
  readSmartThingsConnection(uid: string): Promise<SmartThingsConnection>;
};

// Reuse the exact same Firebase provider and OAuth flow as the shipped mobile
// connection screen. No Samsung credentials enter this module or its caller.
export function loadSmartThingsModule(): Promise<SmartThingsModule> {
  const url = new URL('/bapmunna/smartthings-view.mjs', window.location.origin).href;
  return within(import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url));
}
