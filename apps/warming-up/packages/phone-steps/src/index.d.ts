export type PhoneStepsStatus =
  | "unsupported" | "not-connected" | "permission-required"
  | "permission-denied" | "ready" | "no-data" | "error";

export type PhoneStepsReason =
  | "native-unavailable" | "health-data-unavailable"
  | "health-connect-unavailable" | "health-connect-update-required"
  | "permission-revoked" | "permission-restricted" | "provider-error";

export interface PhoneStepsSnapshot {
  schemaVersion: 1;
  status: PhoneStepsStatus;
  /** Nonnegative integer only when status is ready. Empty records are never zero. */
  count: number | null;
  /** YYYY-MM-DD in the device's current time zone. */
  localDate: string;
  timeZone: string;
  /** Query completion time, NOT the time the sensor last observed movement. */
  updatedAt: string | null;
  source: "android-health-connect" | "ios-healthkit" | null;
  partialDay: boolean;
  /** Null for health-store totals; connection time is not a measurement start. */
  trackingSince: string | null;
  reason?: PhoneStepsReason;
}

export interface PhoneStepsPlugin {
  /** Never prompts. Reads today's total if already connected and permitted. */
  status(): Promise<PhoneStepsSnapshot>;
  /** Call only after a deliberate user action; may show the OS permission prompt. */
  connect(): Promise<PhoneStepsSnapshot>;
  /** Never prompts. Rejects stale results after disconnect or superseding connect. */
  readToday(): Promise<PhoneStepsSnapshot>;
  /** Disable this app's reads. OS health permissions remain managed in Settings. */
  disconnect(): Promise<PhoneStepsSnapshot>;
  openSettings(): Promise<void>;
  /** System browser only; fixed production URL, no caller URL or account payload. */
  openWebApp(): Promise<void>;
  /** Lifecycle signal only. It carries no health data and never requests permission. */
  addListener(eventName: 'appResumed', listenerFunc: () => void): Promise<PluginListenerHandle>;
}

export interface WalkingBoardEntry { publicId: string; nickname: string; count: number; rank: number; }
export interface WalkingBoard {
  date: string; timeZone: 'Asia/Seoul'; updatedAt: string;
  entries: WalkingBoardEntry[]; total: number; limit: number;
  me: { publicId: string; nickname: string; count: number|null; rank: number|null; lastSyncedAt: string|null };
}
export type WalkingSharingScope = 'private' | 'public';
export interface RankingLinkStatus { linked: boolean; confirmed: boolean; revokePending: boolean; nickname?: string; publicId?: string; expiresAt?: string; sharingScope?: WalkingSharingScope; }
export type WalkingConfirmation =
  | {consentVersion: '2026-11-17-private'; shareTodaySteps: true; shareRanking: false}
  | {consentVersion: '2026-11-17'; shareTodaySteps: true; shareRanking?: true};
export interface WalkReminderStatus { enabled: boolean; times: string[]; bloodSugarReminder: boolean; permission: string; }
/** Fixed native routes only. Family message/gift creation is guardian-web-only. */
export type HeartsAction = 'hearts' | 'heartjoin' | 'heartsettings' | 'heartbuy' | 'heartequip' | 'heartread' | 'heartleave' | 'heartleague';
export interface HeartsRequest { action: HeartsAction; body?: Record<string, unknown>; }
/** Native-only network. No bearer credential is exposed through this interface. */
export interface WalkingNativePlugin {
  readRankingToday(): Promise<PhoneStepsSnapshot>;
  rankingLink(input: {code: string}): Promise<RankingLinkStatus>;
  rankingConfirm(input: WalkingConfirmation): Promise<RankingLinkStatus>;
  rankingStatus(): Promise<RankingLinkStatus>;
  rankingSync(): Promise<{ok: boolean; date?: string; count?: number; syncedAt?: string; reason?: string}>;
  rankingBoard(): Promise<WalkingBoard>;
  rankingDisconnect(): Promise<void>;
  /** Uses the confirmed native walking link; never reads health data or prompts. Validate the response in the UI before use. */
  heartsRequest(input: HeartsRequest): Promise<unknown>;
  walkReminderStatus(): Promise<WalkReminderStatus>;
  configureWalkReminders(input: {enabled: boolean; times: string[]; bloodSugarReminder: boolean}): Promise<WalkReminderStatus>;
  openWalkingWebApp(): Promise<void>;
}
export declare const PhoneSteps: PhoneStepsPlugin & WalkingNativePlugin;
/** Browser/SSR-safe; a native platform and installed plugin are both required. */
export declare function isPhoneStepsNativeAvailable(): boolean;
import type { PluginListenerHandle } from '@capacitor/core';
