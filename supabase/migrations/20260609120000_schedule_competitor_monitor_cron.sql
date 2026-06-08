-- 경쟁사 모니터링 주간 크론 (pg_cron + pg_net)
-- 스케줄 등록: npm run setup:competitor-cron

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
