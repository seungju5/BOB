import {
  HEART_ITEMS, buyHeartItem, equipHeartItem,
  type HeartCategory, type HeartItemId, type HeartState,
} from '@/packages/walking-hearts/core.mjs';

export const LOCAL_LOOK_KEY = 'bapmunna.warming.walk-look.v1';
export const TRAIL_STAMP_KEY = 'bapmunna.warming.trail-stamp.v1.';
export const TRAIL_STAMPS = [
  {id:'park', name:'햇살 공원', background:null},
  {id:'blossom', name:'벚꽃 소풍길', background:'blossom'},
  {id:'moon', name:'달빛 언덕', background:'moon'},
] as const;

export async function saveWithWardrobeLock<T>(scope: 'local' | 'demo', save: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('bapmunna.walking.wardrobe.' + scope, save);
  }
  return save();
}

export const CATEGORIES = [
  { id: 'hat', name: '모자', basic: '맨머리' },
  { id: 'outfit', name: '옷', basic: '초록 가디건' },
  { id: 'accessory', name: '소품', basic: '소품 없이' },
  { id: 'background', name: '산책길', basic: '햇살 공원' },
] as const;

export const STARTER_ITEMS = [
  { id: 'berry-beret', name: '딸기 베레모', category: 'hat' },
  { id: 'rose-bow', name: '복숭아 리본', category: 'hat' },
  { id: 'dungarees', name: '버터 멜빵바지', category: 'outfit' },
  { id: 'picnic-dress', name: '쑥빛 체크 원피스', category: 'outfit' },
  { id: 'raincoat', name: '소라빛 우비', category: 'outfit' },
  { id: 'rice-pouch', name: '주먹밥 파우치', category: 'accessory' },
  { id: 'daisy-pin', name: '데이지 브로치', category: 'accessory' },
  { id: 'blossom', name: '벚꽃 소풍길', category: 'background' },
  { id: 'moon', name: '달빛 언덕', category: 'background' },
] as const;

export type StarterId = typeof STARTER_ITEMS[number]['id'];
export type LookId = StarterId | HeartItemId;
export type Look = Record<HeartCategory, LookId | null>;
export type LookChanges = Partial<Look>;
export type WardrobeItem = { id: LookId; name: string; category: HeartCategory; price?: number; unlockDays?: number | null };

export const STARTER_LOOK: Look = { hat: null, outfit: null, accessory: null, background: 'blossom' };
const allItems: readonly WardrobeItem[] = [...STARTER_ITEMS, ...HEART_ITEMS];
export const LOCAL_WARDROBE_ITEMS: readonly WardrobeItem[] = [
  ...STARTER_ITEMS,
  ...HEART_ITEMS.filter(item => item.id === 'star-cape'),
];

export function lookName(category: HeartCategory, id: LookId | null) {
  return allItems.find(item => item.id === id && item.category === category)?.name
    ?? CATEGORIES.find(part => part.id === category)!.basic;
}

export function readLocalLook(stored: string | null, canWearCape = false): Look {
  const look = { ...STARTER_LOOK };
  if (!stored) return look;
  try {
    const data: unknown = JSON.parse(stored);
    if (!data || typeof data !== 'object') return look;
    for (const { id } of CATEGORIES) {
      const item = (data as Record<string, unknown>)[id];
      if (id === 'outfit' && item === 'star-cape' && canWearCape) {
        look.outfit = 'star-cape';
        continue;
      }
      if (item === null || STARTER_ITEMS.some(entry => entry.id === item && entry.category === id)) {
        look[id] = item as StarterId | null;
      }
    }
  } catch { /* A fresh wardrobe is available even when browser storage is damaged. */ }
  return look;
}

export function changedParts(equipped: Look, changes: LookChanges): LookChanges {
  const result: LookChanges = {};
  for (const { id } of CATEGORIES) {
    if (changes[id] !== undefined && changes[id] !== equipped[id]) result[id] = changes[id];
  }
  return result;
}

export function heartOutfitPlan(state: Pick<HeartState, 'owned' | 'equipped' | 'balance'>, changes: LookChanges) {
  const actions: { buy?: HeartItemId; equip: string }[] = [];
  let cost = 0;
  for (const { id } of CATEGORIES) {
    const next = changes[id];
    if (next === undefined || next === state.equipped[id]) continue;
    if (next === null) {
      actions.push({ equip: 'default-' + id });
      continue;
    }
    const item = HEART_ITEMS.find(entry => entry.id === next && entry.category === id);
    if (!item) throw Error('invalid_item');
    const buy = state.owned.includes(item.id) ? undefined : item.id;
    if (buy) cost += item.price;
    actions.push({ buy, equip: item.id });
  }
  if (cost > state.balance) throw Error('insufficient_hearts');
  return actions;
}

export function applyHeartOutfit(state: HeartState, changes: LookChanges) {
  let next = state;
  for (const action of heartOutfitPlan(state, changes)) {
    if (action.buy) next = buyHeartItem(next, action.buy);
    next = equipHeartItem(next, action.equip);
  }
  return next;
}
