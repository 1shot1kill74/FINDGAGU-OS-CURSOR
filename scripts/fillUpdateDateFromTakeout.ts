/**
 * fillUpdateDateFromTakeout.ts
 * 구글챗 Takeout messages.json 마지막 메시지의 created_date를
 * consultations.update_date에 채워넣는 스크립트
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const BASE_DIR = '/Users/findgagu/Desktop/GCS_Data/CustomerOwnedData_구글챗 정보';
const TAKEOUTS = ['Takeout', 'Takeout 2', 'Takeout 3', 'Takeout 4', 'Takeout 5',
                  'Takeout 6', 'Takeout 7', 'Takeout 8', 'Takeout 9'];

// "2022년 11월 21일 월요일 AM 1시 26분 8초 UTC" → "2022-11-21"
function parseKoreanDate(dateStr: string): string | null {
  const m = dateStr.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
  if (!m) return null;
  const year  = m[1];
  const month = m[2].padStart(2, '0');
  const day   = m[3].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Step 1: 전체 Takeout에서 space_id -> 마지막 메시지 날짜 맵 구성
function buildSpaceLastDateMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const takeout of TAKEOUTS) {
    const groupsDir = path.join(BASE_DIR, takeout, 'Google Chat', 'Groups');
    if (!fs.existsSync(groupsDir)) continue;

    const folders = fs.readdirSync(groupsDir).filter(f => f.startsWith('Space '));

    for (const folder of folders) {
      const spaceId = folder.replace('Space ', '');

      const msgFile = path.join(groupsDir, folder, 'messages.json');
      if (!fs.existsSync(msgFile)) continue;

      try {
        const data = JSON.parse(fs.readFileSync(msgFile, 'utf8'));
        const messages = data.messages || [];
        if (!messages.length) continue;

        // 마지막 메시지
        const lastMsg = messages[messages.length - 1];
        const createdDate = lastMsg.created_date;
        if (!createdDate) continue;

        const parsed = parseKoreanDate(createdDate);
        if (!parsed) continue;

        // 여러 Takeout에 같은 space가 있을 수 있으므로 더 최신 날짜로 덮어씀
        const existing = map.get(spaceId);
        if (!existing || parsed > existing) {
          map.set(spaceId, parsed);
        }
      } catch {
        // 파싱 실패 스킵
      }
    }
  }

  return map;
}

// Step 2: Supabase에서 space_id가 있는 상담 전체 조회 (배치)
async function fetchAllConsultations() {
  const all: any[] = [];
  let from = 0;
  const size = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('consultations')
      .select('id, metadata')
      .not('metadata->space_id', 'is', null)
      .range(from, from + size - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < size) break;
    from += size;
  }

  return all;
}

async function run() {
  console.log('=== fillUpdateDateFromTakeout 시작 ===\n');

  console.log('Step 1. Takeout에서 space_id → 마지막 메시지 날짜 맵 구성 중...');
  const dateMap = buildSpaceLastDateMap();
  console.log(`  → 날짜 추출 완료: ${dateMap.size}개\n`);

  console.log('Step 2. Supabase에서 상담 전체 조회 중...');
  const consultations = await fetchAllConsultations();
  console.log(`  → 대상 상담: ${consultations.length}건\n`);

  let matched = 0, updated = 0, failed = 0, noMatch = 0;
  const updates: { id: string; update_date: string }[] = [];

  for (const row of consultations) {
    const spaceId = row.metadata?.space_id;
    if (!spaceId) { noMatch++; continue; }

    const date = dateMap.get(spaceId);
    if (!date) { noMatch++; continue; }

    matched++;
    updates.push({ id: row.id, update_date: date });
  }

  console.log(`Step 3. 매칭 결과: 성공 ${matched}건 / 실패 ${noMatch}건\n`);
  console.log('Step 4. 업데이트 중...');

  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);

    await Promise.all(batch.map(async ({ id, update_date }) => {
      const { error } = await supabase
        .from('consultations')
        .update({ update_date })
        .eq('id', id);

      if (error) { failed++; }
      else { updated++; }
    }));

    if ((i + BATCH) % 500 === 0 || i + BATCH >= updates.length) {
      console.log(`  ${Math.min(i + BATCH, updates.length)} / ${updates.length} 완료...`);
    }
  }

  console.log('\n=== 최종 결과 ===');
  console.log(`  매칭 성공: ${matched}건`);
  console.log(`  업데이트 성공: ${updated}건`);
  console.log(`  업데이트 실패: ${failed}건`);
  console.log(`  매칭 불가: ${noMatch}건`);
}

run().catch(console.error);
