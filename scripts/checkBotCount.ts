import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const { count } = await supabase
  .from('consultations')
  .select('*', { count: 'exact', head: true });

console.log(`전체 상담 수: ${count}건`);
