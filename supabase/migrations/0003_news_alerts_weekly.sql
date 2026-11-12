-- 알림 종류 추가: 어르신 버튼 소식(eat_out, away)과 주간 리포트(weekly_report)
-- (미적용: 팀 확인 후 적용하고 Edge Functions senior·jobs를 함께 재배포한다)

-- 1) 알림 종류 허용 목록
alter table public.alerts drop constraint if exists alerts_type_check;
alter table public.alerts add constraint alerts_type_check
  check (type in ('missed_meals', 'fasting', 'emergency', 'help_request', 'device_offline', 'eat_out', 'away', 'weekly_report'));

-- 2) '같은 종류의 열린 알림은 하나만' 규칙은 판단 알림에만 둔다 (소식 알림은 여러 번 올 수 있다)
drop index if exists public.alerts_one_open;
create unique index alerts_one_open on public.alerts (household_id, type)
  where resolved_at is null and type not in ('help_request', 'eat_out', 'away', 'weekly_report');

-- 3) 주간 리포트: 매주 월요일 09:00 KST (= 일요일 24:00 UTC → 월요일 00:00 UTC)
select cron.schedule('bapmutna-weekly', '0 0 * * 1', $$ select private.run_job('weekly') $$);
