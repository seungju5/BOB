export type Member = {
  uid: string;
  email: string;
  verified: boolean;
  joined: string | null;
  lastLogin: string | null;
  disabled: boolean;
};
export type Profile = {
  uid: string;
  email: string;
  name: string;
  saved: string | null;
  version: string | null;
};
export type Cursor = { seconds: number; nanos: number; id: string };
export type Stage = 'new' | 'review' | 'done';
export type StudioDetail = {
  member: Member | null;
  profile: Profile | null;
  householdAt: string | null;
  settingsAt: string | null;
  stage: Stage;
  note: string;
  caseVersion: string | null;
  caseAt: string | null;
};
export type Overview = {
  total: number;
  verified: number;
  stored: number;
  days: { day: string; count: number }[];
  latest: Member[];
  syncedAt: string | null;
};
export type StudioChange =
  | { type: 'name'; name: string; version: string | null }
  | { type: 'case'; note: string; stage: Stage; version: string | null };
export type Studio = {
  watch(
    uid: string,
    callback: (allowed: boolean | null) => void,
    failed: (e: unknown) => void,
  ): () => void;
  allowed(uid: string): Promise<boolean>;
  recordSignIn(uid: string): Promise<void>;
  overview(uid: string): Promise<Overview>;
  page(
    uid: string,
    kind: 'members' | 'profiles',
    search: string,
    cursor: Cursor | null,
  ): Promise<{ rows: (Member | Profile)[]; next: Cursor | null }>;
  detail(uid: string, id: string): Promise<StudioDetail>;
  save(uid: string, id: string, change: StudioChange): Promise<void>;
};
