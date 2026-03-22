import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// 오늘 오후 5시 KST = 2026-03-05T08:00:00Z (UTC)
const cutoff = '2026-03-05T08:00:00.000Z';

// 먼저 대상 조회
const { data, error } = await supabase
  .from('consultations')
  .select('id, project_name, created_at')
  .ilike('project_name', '%테스트%')
  .gte('created_at', cutoff);

if (error) { console.error(error.message); process.exit(1); }

if (!data || data.length === 0) {
  console.log('삭제 대상 없음 (오후 5시 이후 "테스트" 포함 항목 없음)');
  process.exit(0);
}

console.log(`삭제 대상: ${data.length}건`);
for (const row of data) {
  console.log(`  - ${row.project_name} (${row.created_at}) [${row.id}]`);
}

const ids = data.map(r => r.id);
const { error: delError } = await supabase.from('consultations').delete().in('id', ids);
if (delError) { console.error('삭제 실패:', delError.message); process.exit(1); }

console.log(`\n삭제 완료: ${ids.length}건`);
