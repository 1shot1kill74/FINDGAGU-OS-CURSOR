import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const { data, error } = await supabase
  .from('consultations')
  .select('id, project_name, created_at')
  .gte('created_at', '2026-03-06T00:00:00.000Z')
  .order('created_at', { ascending: true });

if (error) { console.error(error.message); process.exit(1); }
for (const r of data ?? []) {
  console.log(`${r.project_name} | ${r.created_at} | ${r.id}`);
}
console.log(`\n총 ${data?.length ?? 0}건`);
