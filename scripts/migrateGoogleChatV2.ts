
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const baseDir = '/Users/findgagu/Desktop/GCS_Data/CustomerOwnedData_구글챗 정보/Takeout 2/Google Chat/Users';

async function migrate() {
    console.log('--- 마이그레이션 재시작 (v2: Robust) ---');

    const users = fs.readdirSync(baseDir);
    const allSpaces = new Map();

    for (const userDir of users) {
        const filePath = path.join(baseDir, userDir, 'user_info.json');
        if (fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (data.membership_info) {
                    data.membership_info.forEach((info: any) => {
                        if (info.group_name && info.group_id.startsWith('Space ')) {
                            allSpaces.set(info.group_id, info.group_name);
                        }
                    });
                }
            } catch (e) { }
        }
    }

    console.log(`총 ${allSpaces.size}개의 유니크 스페이스를 처리합니다.`);

    let updatedCount = 0;
    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const entries = Array.from(allSpaces.entries());

    for (let i = 0; i < entries.length; i++) {
        const [groupId, groupName] = entries[i];
        if ((i + 1) % 100 === 0) console.log(`${i + 1}/${entries.length} 처리 중... (U:${updatedCount}, I:${insertedCount}, S:${skippedCount}, E:${errorCount})`);

        const spaceId = groupId.replace('Space ', '');
        const chatUrl = `https://mail.google.com/chat/u/0/#chat/space/${spaceId}`;

        try {
            // 파싱 로직 강화
            // 예: "완료 2408 김해 학원 9574" 
            // 예: "견적 2503 루브르공간인테리어 8408 / 서초"
            const statusMatch = groupName.match(/^(완료|견적|진행|캔슬|보류|컨택|추가|A\/S|상담)/);
            const status = statusMatch ? statusMatch[1] : '미지정';

            // 업체명/중요 키워드 추출 (상태와 날짜 제거 후 남은 부분)
            let cleanedName = groupName.replace(/^(완료|견적|진행|캔슬|보류|컨택|추가|A\/S|상담)\s*/, '');
            cleanedName = cleanedName.replace(/\d{4}\s*/, ''); // 날짜 제거
            const keywords = cleanedName.split(/[\s\/()]/).filter(s => s.length >= 2);

            let existingLead = null;

            // 키워드가 있으면 검색 시도
            if (keywords.length > 0) {
                // 가장 긴 키워드 우선 사용
                const mainKeyword = keywords.sort((a, b) => b.length - a.length)[0];

                const { data } = await supabase
                    .from('consultations')
                    .select('id, metadata')
                    .ilike('company_name', `%${mainKeyword}%`)
                    .limit(1);

                if (data && data.length > 0) {
                    existingLead = data[0];
                }
            }

            if (existingLead) {
                // 기존 카드 업데이트
                const updatedMetadata = {
                    ...(existingLead.metadata as object || {}),
                    google_chat_url: chatUrl,
                    last_synced_at: new Date().toISOString()
                };

                await supabase
                    .from('consultations')
                    .update({ metadata: updatedMetadata })
                    .eq('id', existingLead.id);
                updatedCount++;
            } else {
                // 매칭 안 됨 -> 완료/진행/견적/상담 등 중요 상태인 경우만 신규 생성
                if (['완료', '진행', '견적', '상담'].includes(status)) {
                    const insertData: any = {
                        company_name: groupName,
                        status: status === '완료' ? '시공완료' : (status === '견적' ? '견적중' : '상담접수'),
                        metadata: {
                            google_chat_url: chatUrl,
                            source: 'google_chat_migration',
                            raw_name: groupName,
                            migrated_at: new Date().toISOString()
                        }
                    };
                    await supabase.from('consultations').insert(insertData);
                    insertedCount++;
                } else {
                    skippedCount++;
                }
            }
        } catch (err) {
            errorCount++;
            console.error(`Error processing [${groupName}]:`, err);
        }
    }

    console.log('\n--- 마이그레이션 최종 결과 ---');
    console.log(`- 전체 스페이스: ${entries.length}`);
    console.log(`- 매칭/업데이트: ${updatedCount}`);
    console.log(`- 신규 생성: ${insertedCount}`);
    console.log(`- 스킵(상태 불일치): ${skippedCount}`);
    console.log(`- 에러: ${errorCount}`);
}

migrate();
