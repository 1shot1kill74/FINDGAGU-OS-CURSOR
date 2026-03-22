import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const ids = [
  'c87baf43-5c13-45be-a04d-07470fa0ee78', // AAAAXpfc2Cs (displayName 없음)
  'e80e3c7b-330b-4046-9d22-1af6ed60e388', // AAAA1T4dqMw (displayName 없음)
  'bafc2480-7ece-46b4-84d7-e811b48633be', // [씨트컷팅]거창상사
  '4eaa9184-90e4-440b-8b82-5d01876556ed', // [온라인판매]내용공유
  '211a4aca-ae82-4f3e-8285-f193babebd90', // 섹션 테스트
  '830a8e14-f25c-4035-8b67-6d9c6d50ed28', // 견적 2603 테스트 2
];

const { error } = await supabase.from('consultations').delete().in('id', ids);
if (error) { console.error('삭제 실패:', error.message); process.exit(1); }
console.log(`삭제 완료: ${ids.length}건`);
