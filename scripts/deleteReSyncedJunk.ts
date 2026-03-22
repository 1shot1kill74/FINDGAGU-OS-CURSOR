import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const spaceIds = [
  'AAQANAqj78A',  // 견적 2603 테스트 2
  'AAQAMf4380w',  // 섹션 테스트
  'AAAAl0pjR3o',  // [온라인판매]내용공유
  'AAAA0NNNK7w',  // [씨트컷팅]거창상사
  'AAAA1T4dqMw',  // displayName 없음
  'AAAAXpfc2Cs',  // displayName 없음
];

for (const spaceId of spaceIds) {
  const { error } = await supabase
    .from('consultations')
    .delete()
    .eq('metadata->>space_id', spaceId);
  if (error) console.error(`실패 ${spaceId}:`, error.message);
  else console.log(`삭제: ${spaceId}`);
}
console.log('\n완료');
