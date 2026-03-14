/**
 * fillPhoneFromTakeout.ts
 * 구글챗 Takeout messages.json에서 전화번호를 추출해
 * customer_phone이 null인 consultations에 채워넣는 스크립트
 *
 * 실행: npx tsx scripts/fillPhoneFromTakeout.ts
 * 드라이런: npx tsx scripts/fillPhoneFromTakeout.ts --dry
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

const DRY_RUN = process.argv.includes('--dry');

const BASE_DIR = '/Users/findgagu/Desktop/GCS_Data/CustomerOwnedData_구글챗 정보';
const TAKEOUTS = [
  'Takeout', 'Takeout 2', 'Takeout 3', 'Takeout 4', 'Takeout 5',
  'Takeout 6', 'Takeout 7', 'Takeout 8', 'Takeout 9',
];

function extractPhone(text: string): string | null {
  const m = text.match(/(0\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// Takeout 전체 스캔: spaceId → phone 맵 구성
function buildPhoneMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const takeout of TAKEOUTS) {
    const groupsDir = path.join(BASE_DIR, takeout, 'Google Chat', 'Groups');
    if (!fs.existsSync(groupsDir)) continue;

    for (const spaceDirName of fs.readdirSync(groupsDir)) {
      // 폴더명: "Space AAAAkh447no" → spaceId: "AAAAkh447no"
      const match = spaceDirName.match(/^Space (.+)$/);
      if (!match) continue;
      const spaceId = match[1];

      // 이미 찾은 스페이스는 스킵
      if (map.has(spaceId)) continue;

      const messagesPath = path.join(groupsDir, spaceDirName, 'messages.json');
      if (!fs.existsSync(messagesPath)) continue;

      let data: any;
      try {
        data = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
      } catch {
        continue;
      }

      for (const msg of (data.messages || [])) {
        const phone = extractPhone(msg.text || '');
        if (phone) {
          map.set(spaceId, phone);
          break; // 스페이스당 첫 번째 전화번호만
        }
      }
    }
  }

  return map;
}

async function fetchNullPhone(): Promise<{ id: string; channel_chat_id: string | null }[]> {
  const results: { id: string; channel_chat_id: string | null }[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('consultations')
      .select('id, channel_chat_id')
      .is('customer_phone', null)
      .not('channel_chat_id', 'is', null)
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
  console.log(`=== fillPhoneFromTakeout ${DRY_RUN ? '[DRY RUN]' : '[실제 적용]'} ===`);

  console.log('Takeout 스캔 중...');
  const phoneMap = buildPhoneMap();
  console.log(`Takeout에서 전화번호 발견: ${phoneMap.size}개 스페이스`);

  const rows = await fetchNullPhone();
  console.log(`customer_phone null 레코드: ${rows.length}건`);

  const toUpdate: { id: string; phone: string; channel_chat_id: string }[] = [];
  const noMatch: string[] = [];

  for (const row of rows) {
    if (!row.channel_chat_id) continue;

    // channel_chat_id 형식: "spaces/AAAAkh447no" → spaceId: "AAAAkh447no"
    const spaceId = row.channel_chat_id.replace(/^spaces\//, '');
    const phone = phoneMap.get(spaceId);

    if (phone) {
      toUpdate.push({ id: row.id, phone, channel_chat_id: row.channel_chat_id });
    } else {
      noMatch.push(row.channel_chat_id);
    }
  }

  console.log(`\n파싱 성공: ${toUpdate.length}건`);
  console.log(`Takeout 미매칭 (GAS 대상): ${noMatch.length}건`);

  console.log('\n── 파싱 성공 샘플 (최대 20건) ──');
  toUpdate.slice(0, 20).forEach(r =>
    console.log(`  ${r.channel_chat_id} → "${r.phone}"`)
  );

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 실제 적용 없음. --dry 제거 후 재실행하면 Supabase에 반영됩니다.');
    return;
  }

  let patched = 0;
  for (const row of toUpdate) {
    const { error } = await supabase
      .from('consultations')
      .update({ customer_phone: row.phone })
      .eq('id', row.id);
    if (error) {
      console.error(`  ❌ ${row.id}: ${error.message}`);
    } else {
      patched++;
    }
    if (patched % 100 === 0) console.log(`  진행: ${patched}/${toUpdate.length}`);
  }

  console.log(`\n완료. ${patched}건 업데이트.`);
}

main().catch(e => { console.error(e); process.exit(1); });
