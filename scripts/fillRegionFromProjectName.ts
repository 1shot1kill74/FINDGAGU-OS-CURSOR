/**
 * fillRegionFromProjectName.ts
 * consultations.project_name에서 지역 키워드를 추출해
 * region이 null인 레코드에 채워넣는 스크립트
 *
 * 실행: npx tsx scripts/fillRegionFromProjectName.ts
 * 드라이런: npx tsx scripts/fillRegionFromProjectName.ts --dry
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const DRY_RUN = process.argv.includes('--dry');

// ── 생활권/동네 별칭 → 표준 region (최우선 매핑) ────────────────────────────
// 주의: 중복 위험 키워드(광주, 중구, 서구 등)는 여기서 단독 매핑하지 않음
const ALIAS: [RegExp, string][] = [
  // 경기 고양
  [/일산/,     '경기 고양'],
  [/정발산/,   '경기 고양'],
  // 경기 성남
  [/분당/,     '경기 성남'],
  [/정자동|정자역|정자/,  '경기 성남'],
  [/판교/,     '경기 성남'],
  [/야탑/,     '경기 성남'],
  [/서현/,     '경기 성남'],
  [/백현/,     '경기 성남'],
  [/대장동/,   '경기 성남'],
  // 경기 안양
  [/평촌/,     '경기 안양'],
  // 경기 군포
  [/산본/,     '경기 군포'],
  // 경기 부천
  [/중동/,     '경기 부천'],
  // 경기 파주
  [/운정/,     '경기 파주'],
  // 경기 과천
  [/과천/,     '경기 과천'],
  // 인천 연수
  [/송도/,     '인천 연수'],
  // 인천 서구
  [/청라/,     '인천 서구'],
  // 인천 중구
  [/영종/,     '인천 중구'],
  // 서울 양천
  [/목동/,     '서울 양천'],
  // 서울 마포
  [/상암/,     '서울 마포'],
  // 서울 강남
  [/대치/,     '서울 강남'],
  // 서울 서대문
  [/신촌/,     '서울 서대문'],
];

// ── 시/도 키워드 → 정규화된 시/도명 ──────────────────────────────────────────
const SIDO: [RegExp, string][] = [
  [/서울/,   '서울'],
  [/부산/,   '부산'],
  [/인천/,   '인천'],
  [/대구/,   '대구'],
  [/광주/,   '광주'],
  [/대전/,   '대전'],
  [/울산/,   '울산'],
  [/세종/,   '세종'],
  [/경기/,   '경기'],
  [/강원/,   '강원'],
  [/충북|충청북/,  '충북'],
  [/충남|충청남/,  '충남'],
  [/전북|전라북/,  '전북'],
  [/전남|전라남/,  '전남'],
  [/경북|경상북/,  '경북'],
  [/경남|경상남/,  '경남'],
  [/제주/,   '제주'],
];

// ── 시/군/구 키워드 목록 (자주 등장하는 순) ──────────────────────────────────
const SIGUNGU = [
  // 경기
  '수원', '성남', '용인', '부천', '안산', '안양', '남양주', '화성', '평택', '의정부',
  '시흥', '파주', '광명', '김포', '광주', '군포', '하남', '오산', '이천', '안성',
  '의왕', '양평', '여주', '동두천', '가평', '연천', '포천', '양주', '구리', '고양',
  // 서울 구
  '강남', '강서', '강북', '강동', '서초', '송파', '마포', '영등포', '구로', '금천',
  '동작', '관악', '은평', '서대문', '종로', '중구', '용산', '성동', '광진', '동대문',
  '중랑', '성북', '도봉', '노원', '양천',
  // 인천 구
  '남동', '부평', '계양', '서구', '미추홀', '연수', '동구', '중구', '강화', '옹진',
  // 부산 구
  '해운대', '수영', '연제', '동래', '금정', '북구', '강서', '사상', '사하', '서구',
  '중구', '동구', '영도', '남구', '기장',
  // 충청
  '천안', '청주', '충주', '제천', '공주', '아산', '서산', '논산', '계룡', '당진',
  '보령', '홍성', '예산', '태안',
  // 전라
  '전주', '익산', '군산', '정읍', '남원', '김제', '목포', '여수', '순천', '나주',
  '광양', '담양', '곡성', '구례', '고흥', '보성', '화순', '장흥', '강진', '해남',
  // 경상
  '포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산',
  '창원', '진주', '통영', '사천', '김해', '밀양', '거제', '양산', '의령',
  // 강원
  '춘천', '원주', '강릉', '동해', '태백', '속초', '삼척', '홍천', '횡성', '영월',
  // 제주
  '제주시', '서귀포',
];

function extractRegionFromName(name: string): string | null {
  if (!name) return null;

  // 1단계: 생활권/별칭 매핑 (최우선)
  for (const [pattern, region] of ALIAS) {
    if (pattern.test(name)) return region;
  }

  let sido: string | null = null;
  let sigungu: string | null = null;

  // 2단계: 시/도 추출
  for (const [pattern, normalized] of SIDO) {
    if (pattern.test(name)) {
      sido = normalized;
      break;
    }
  }

  // 3단계: 시/군/구 추출 (앞에서부터 첫 번째 매칭)
  for (const sg of SIGUNGU) {
    if (name.includes(sg)) {
      sigungu = sg;
      break;
    }
  }

  if (sido && sigungu) return `${sido} ${sigungu}`;
  if (sido) return sido;
  if (sigungu) return sigungu;
  return null;
}

async function fetchAll(): Promise<{ id: string; project_name: string }[]> {
  const results: { id: string; project_name: string }[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('consultations')
      .select('id, project_name')
      .is('region', null)
      .not('project_name', 'is', null)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return results;
}

async function main() {
  console.log(`=== fillRegionFromProjectName ${DRY_RUN ? '[DRY RUN]' : '[실제 적용]'} ===`);

  const rows = await fetchAll();
  console.log(`region null 레코드: ${rows.length}건`);

  const toUpdate: { id: string; region: string; project_name: string }[] = [];
  const noMatch: string[] = [];

  for (const row of rows) {
    const region = extractRegionFromName(row.project_name);
    if (region) {
      toUpdate.push({ id: row.id, region, project_name: row.project_name });
    } else {
      noMatch.push(row.project_name);
    }
  }

  console.log(`파싱 성공: ${toUpdate.length}건`);
  console.log(`파싱 실패: ${noMatch.length}건`);

  // 샘플 출력
  console.log('\n── 파싱 성공 샘플 (최대 20건) ──');
  toUpdate.slice(0, 20).forEach(r => console.log(`  "${r.project_name}" → "${r.region}"`));

  console.log('\n── 파싱 실패 샘플 (최대 20건) ──');
  noMatch.slice(0, 20).forEach(n => console.log(`  "${n}"`));

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 실제 적용 없음. --dry 제거 후 재실행하면 Supabase에 반영됩니다.');
    return;
  }

  // PATCH (배치 100건씩)
  let patched = 0;
  const BATCH = 100;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    for (const row of batch) {
      const { error } = await supabase
        .from('consultations')
        .update({ region: row.region })
        .eq('id', row.id);
      if (error) {
        console.error(`  ❌ ${row.id} 실패: ${error.message}`);
      } else {
        patched++;
      }
    }
    console.log(`  진행: ${Math.min(i + BATCH, toUpdate.length)}/${toUpdate.length}`);
  }

  console.log(`\n완료. ${patched}건 업데이트.`);
}

main().catch(e => { console.error(e); process.exit(1); });
