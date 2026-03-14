import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const updates = [
  { id: '4d936b70-f99f-4381-9de7-8449fb19c0df', update_date: '2025-11-10' }, // 1. 가구찾기_ESM_주문관리
  { id: '670b09dc-06fe-4a5a-a205-17221c2c42a5', update_date: '2024-10-23' }, // 2. 가구찾기_쿠팡/기타_주문관리
  { id: '149aedca-1d7a-4982-a39c-eb374725a2cf', update_date: '2022-11-03' }, // 3. 견적 2210 인천 스터디카페 예정
  { id: '4384ede8-0868-4342-8960-f4a9b2018f47', update_date: '2022-11-18' }, // 4. 견적 2211 충북보은 축협 경매장
  { id: 'eb60fe1e-3a36-445c-a0f6-6d6d8ee301d5', update_date: '2023-02-20' }, // 5. 견적 2303 용인 수진 네이버문의
  { id: '716217c7-484a-498d-9c97-4a875796a68d', update_date: '2023-05-26' }, // 6. 견적 2305 드림플레이 인테리어
  { id: '553ca172-4b39-4b7c-8e0d-b23a03dabe63', update_date: '2023-07-06' }, // 7. 견적 2307 부산 커피카페 스터디좌석 3379
  { id: '9a458efc-6cf8-4292-98d5-71142ec0f09a', update_date: '2023-07-13' }, // 8. 견적 2307 시흥학원 -베이직
  { id: '8a531be3-c4ea-4c05-aa0e-57864a13046a', update_date: '2023-07-31' }, // 9. 견적 2307 용산 데시앙 포레
  { id: '89a3c5ad-4fce-47ce-9d54-7437bdf58182', update_date: '2023-11-13' }, // 10. 견적 2310 대전 학원 클래식 8809
  { id: '8b19b708-c181-4134-a720-6a64108e48e7', update_date: '2023-10-16' }, // 11. 견적 2310 인천 예일고 우성건축
  { id: '73ca61ad-58ad-49ca-956f-a2562fc2ecc2', update_date: '2023-11-22' }, // 12. 견적 2311 시흥학원 8478
  { id: '3f4820a9-ef2f-4f0d-a234-a0ef741a0ca0', update_date: '2023-11-14' }, // 13. 견적 2311 용인 기흥 서천학원9364
  { id: 'b1430ae1-ae72-4b69-b68a-a414c37f1756', update_date: '2024-06-19' }, // 14. 견적 2312 영등포 스터디카페 5996
  { id: 'e6a1a5a5-174f-43eb-8000-2cc1cde82ace', update_date: '2023-12-15' }, // 15. 견적 2312 울산 가람디자인3792
  { id: '81d7b434-da82-46b8-bb3b-4718eaad7dee', update_date: '2024-02-02' }, // 16. 견적 2402 전북익산 7412
  { id: '5bfb1903-3720-4aca-a75d-5c1d8565df4d', update_date: '2024-03-14' }, // 17. 견적 2403 군산 학원 3503
  { id: '654cc352-61bf-4ec5-9434-5026d59f6bcd', update_date: '2024-03-18' }, // 18. 견적 2403 용인 수지구 커뮤니티
  { id: '782ccc1a-afa0-4f99-a8cd-f4cb934318bc', update_date: '2024-04-11' }, // 19. 견적 2404 남양주 학원
  { id: '79410317-76c8-4dbd-a2d8-16df3cce97bf', update_date: '2024-04-05' }, // 20. 견적 2404 대전 한남대학교
  { id: 'd5dec622-6eed-499f-8c14-ab4ea28b15da', update_date: '2024-04-11' }, // 21. 견적 2404 채널톡 jione8522
  { id: 'cd116c00-325f-4dc5-ba1d-ae02bba21988', update_date: '2024-04-19' }, // 22. 견적 2404 채널톡 yujin9921
  { id: '2c3734f6-18e2-4df8-9954-4b9f932aa717', update_date: '2024-11-13' }, // 23. 견적 2405 성북구 종암동 래미안
  { id: '8d8f4a8e-05c2-485d-b3b6-62838b9018ff', update_date: '2024-08-08' }, // 24. 견적 2408 오산 학원 2802
  { id: '1a56fa5f-ae95-4872-a2f3-be805d7a77ca', update_date: '2024-09-19' }, // 25. 견적 2408 충주 학원 4788
  // 26번 삭제
  { id: 'ab6c4050-7bfb-414a-af30-9073fb1bae99', update_date: '2024-09-19' }, // 27. 견적 2409 목포 천년나무아파트 7533
  { id: 'a89442fe-2827-49a8-910f-d3f972e528d0', update_date: '2024-09-10' }, // 28. 견적 2409 별내 아파트 내 스터디카페
  { id: '64fdebc7-842a-4882-bef3-c69fbb7d1074', update_date: '2024-09-12' }, // 29. 견적 2409 전남 광주 관리형 학원 4747
  { id: 'dc5f7e4c-15d3-4677-8433-7628a9bb144a', update_date: '2024-10-14' }, // 30. 견적 2410 경남 창녕군 0621
  { id: '63006c16-faf5-4a5d-9241-4c0d748c0005', update_date: '2024-09-30' }, // 31. 견적 2410 의정부 관리형 학원 0587
  { id: '0e4dbe5f-fc06-484a-b694-2e4ac99fa65a', update_date: '2025-02-18' }, // 32. 견적 2502 경남 양산 오륜개발
  { id: '4fb3273c-a1a7-411f-ac82-060ce5ceb9df', update_date: '2025-02-14' }, // 33. 견적 2502 대치동 관리형 학원 9293
  { id: '02392524-f8e5-424c-aec2-b8f1f6b01474', update_date: '2025-02-24' }, // 34. 견적 2502 울산 학원 0507
  { id: '40d2eec0-9ecc-4f02-8c43-251d70b12f37', update_date: '2025-03-28' }, // 35. 견적 2503 오산학원 2824
  { id: '3260eba1-ba52-467c-a1cc-52ab99c1f626', update_date: '2025-03-21' }, // 36. 견적 2503 평택학원 0917
  { id: '23d7d4ec-6a00-4830-8fe8-aa551f9292db', update_date: '2025-05-22' }, // 37. 견적 2505 도곡동 스퀘어 8331
  // 38번 삭제
  { id: 'e235c4a3-9e84-48e1-994f-2a54b7e39c5a', update_date: '2025-10-02' }, // 39. 견적 2509 강서 마곡동학원 8791
  { id: '04d43520-a842-49a9-9410-77da79af745d', update_date: '2025-12-11' }, // 40. 견적 2512 부산사하구학원 2714
  { id: '1ebbeaf4-285b-4e36-86ce-4332e3186b26', update_date: '2026-01-07' }, // 41. 견적 2601 디딤카공-부산시청역점
  { id: '2afa6920-831e-4cdd-a543-3b161d3f76ad', update_date: '2026-02-06' }, // 42. 견적 2602 안양심플 9091
  { id: 'e29869c8-50ae-4c48-a445-2919adffab0a', update_date: '2024-03-20' }, // 43. 완료 2309 동작구 와이드 0419
  { id: '46271c75-7bad-4df3-bfe2-30f0276b4ff0', update_date: '2025-07-10' }, // 44. 완료 2408 동두천 0320 / 4차
  { id: '334de34d-7508-4a80-9738-999a0c065f79', update_date: '2025-02-07' }, // 45. 완료 2412 동탄 김샘학원 3837
  { id: 'aece633c-7ea9-44f0-95eb-b84e54ba50f1', update_date: '2025-02-05' }, // 46. 완료 2502 루브르공간디자인 8408
  { id: 'a2bf247d-742c-462e-a429-bb9efb0b33c0', update_date: '2025-12-22' }, // 47. 진행 2512 순창 6450
  { id: '7ea6f404-3b39-4ba0-8a98-add11638c65b', update_date: '2022-12-22' }, // 48. 진행_2212 무안 쓰고쓰고 글쓰기학원
  { id: '69997a77-dc6a-4709-b111-2f9485660167', update_date: '2024-08-23' }, // 49. 캔슬 2408 삼척고
];

const deleteIds = [
  '0befcf7d-ccbc-4621-96ac-51975ecc9f4a', // 26. 견적 2409 동대문 관리형 1979
  '51145b1c-8862-4e50-82b1-dc8f106dd20e', // 38. 견적 2505 아파트 6665
];

// 삭제
const { error: delError } = await supabase.from('consultations').delete().in('id', deleteIds);
if (delError) { console.error('삭제 실패:', delError.message); process.exit(1); }
console.log('삭제 완료: 2건\n');

// 업데이트
let updated = 0, failed = 0;
for (const { id, update_date } of updates) {
  const { error } = await supabase.from('consultations').update({ update_date }).eq('id', id);
  if (error) { console.error(`실패 ${id}:`, error.message); failed++; }
  else updated++;
}
console.log(`업데이트 완료: ${updated}건 / 실패: ${failed}건`);

// 최종 확인
const { data } = await supabase.from('consultations').select('id').is('update_date', null);
console.log(`\n남은 update_date 미입력: ${data?.length ?? '?'}건`);
