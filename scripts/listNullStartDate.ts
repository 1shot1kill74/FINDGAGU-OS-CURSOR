import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const { data, error } = await supabase
  .from('consultations')
  .select('id, project_name, metadata')
  .is('start_date', null);

if (error) { console.error(error.message); process.exit(1); }

console.log(`start_date 미입력 건수: ${data?.length}건\n`);
console.log('No | 프로젝트명 | 구글챗 링크');
console.log('---');
for (const [i, row] of (data || []).entries()) {
  const spaceId = row.metadata?.space_id;
  const url = spaceId
    ? `https://chat.google.com/room/${spaceId}`
    : (row.metadata?.google_chat_url || '링크 없음');
  console.log(`${i + 1}. ${row.project_name}`);
  console.log(`   ${url}`);
  console.log(`   id: ${row.id}`);
}
