-- 호환 확장: 기존 breakfast/lunch/dinner 데이터와 세 끼 기본값을 그대로 보존한다.
-- 소스 준비만 한다. 운영 적용과 Edge Function 재배포는 별도 승인·검증 대상이다.
alter table public.meal_slots
  drop constraint if exists meal_slots_slot_check;
alter table public.meal_slots
  add constraint meal_slots_slot_check
  check (slot in ('breakfast', 'lunch', 'dinner', 'fourth'));
