import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const deleteIds = [
  'e4392220-5c49-42e1-831b-496a1ee7bbcf', // 테스
  '7676c754-2585-4cf1-954a-2d8f1c8ec255', // 섹션 테스트
  'e6515c44-7707-4042-b467-6f6f66b1444d', // -
  '246b0b17-07bc-4164-82e9-1448f88651aa', // 제품관리자
];

const { error } = await supabase.from('consultations').delete().in('id', deleteIds);
if (error) { console.error('삭제 실패:', error.message); process.exit(1); }
console.log('삭제 완료: 4건 (테스, 섹션 테스트, -, 제품관리자)');
