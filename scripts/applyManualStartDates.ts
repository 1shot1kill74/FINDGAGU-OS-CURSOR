import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const updates = [
  { id: '320aeb17-59d8-4aab-a67f-497cd6456735', start_date: '2024-06-18' }, // 1번
  { id: '82879fae-2a92-4047-b144-c880fd3fa867', start_date: '2024-07-16' }, // 2번
  { id: '5449c084-891b-4acc-a3bf-251245769b3b', start_date: '2025-01-31' }, // 3번
  { id: '48311768-ff7e-4b60-b4e6-01c116491fb7', start_date: '2024-06-07' }, // 4번
  { id: 'c1ac2e8c-9371-48ba-8e80-e5fc07903f33', start_date: '2024-07-04' }, // 5번
  { id: '3b4fabaa-1347-4f42-949c-a4cc19881fd7', start_date: '2025-02-05' }, // 6번
  { id: '0ef682ed-b9b4-4c38-92b5-a6aa9e7de8c7', start_date: '2024-05-08' }, // 7번
  { id: '0b241956-6cd7-4b3c-9e9d-cc9444919432', start_date: '2025-01-22' }, // 8번
  { id: 'b1f79e28-fc52-4213-923f-a869e8600082', start_date: '2025-01-08' }, // 9번
  { id: 'b62d8ba2-083f-4770-9dcd-88661d571c88', start_date: '2024-06-07' }, // 10번
  { id: '674c0f5b-f432-4627-a482-50bb17aaa4d5', start_date: '2024-10-02' }, // 11번
  { id: '149aedca-1d7a-4982-a39c-eb374725a2cf', start_date: '2022-10-26' }, // 13번
  { id: '74379f56-9082-4e8c-a710-d796a200a84b', start_date: '2025-09-29' }, // 14번
];

const deleteIds = [
  'ede4b279-2168-46e7-8800-0780e5d5f5b9', // 12번 해누리건축
  '5607ceee-e6b3-425c-a87c-a2ec212ca453', // 15번 2202 염창동 학원
  '7ca6c033-986f-41f0-b213-ac817c5acce1', // 16번 견적 2203 우리씨앤에스
];

// 업데이트
let updated = 0, failed = 0;
for (const { id, start_date } of updates) {
  const { error } = await supabase.from('consultations').update({ start_date }).eq('id', id);
  if (error) { console.error(`업데이트 실패 ${id}:`, error.message); failed++; }
  else updated++;
}
console.log(`업데이트 완료: ${updated}건 / 실패: ${failed}건`);

// 삭제
const { error: delError } = await supabase.from('consultations').delete().in('id', deleteIds);
if (delError) { console.error('삭제 실패:', delError.message); }
else console.log(`삭제 완료: ${deleteIds.length}건`);

// 최종 확인
const { data } = await supabase.from('consultations').select('id').is('start_date', null);
console.log(`\n남은 start_date 미입력 건수: ${data?.length ?? '?'}건`);
