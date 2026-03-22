
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
    console.log('--- 마이그레이션 시작 (v3: UI 가시성 보정) ---');
    const now = new Date().toISOString().slice(0, 10);

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
        if ((i + 1) % 100 === 0) console.log(`${i + 1}/${entries.length} 처리 중...`);

        const spaceId = groupId.replace('Space ', '');
        const chatUrl = `https://mail.google.com/chat/u/0/#chat/space/${spaceId}`;

        try {
            const statusMatch = groupName.match(/^(완료|견적|진행|캔슬|보류|컨택|추가|A\/S|상담)/);
            const status = statusMatch ? statusMatch[1] : '미지정';

            let cleanedId = groupName.replace(/^(완료|견적|진행|캔슬|보류|컨택|추가|A\/S|상담)\s*/, '');
            const keywords = cleanedId.split(/[\s\/()]/).filter(s => s.length >= 2);

            let existingLead = null;

            if (keywords.length > 0) {
                const sortedK = [...keywords].sort((a, b) => b.length - a.length);
                const mainKeyword = sortedK[0];

                const { data } = await supabase
                    .from('consultations')
                    .select('id, metadata')
                    .ilike('project_name', `%${mainKeyword}%`) // company_name 대신 project_name 사용
                    .limit(1);

                if (data && data.length > 0) existingLead = data[0];
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
                    .update({
                        metadata: updatedMetadata,
                        is_visible: true // 가시성 활성화
                    } as any)
                    .eq('id', existingLead.id);
                updatedCount++;
            } else {
                // 매칭 안 됨 -> 신규 생성
                if (['완료', '진행', '견적', '상담'].includes(status)) {
                    const insertData: any = {
                        project_name: groupName, // company_name 대신 project_name 필수로 채움
                        status: status === '완료' ? '시공완료' : (status === '견적' ? '견적중' : '상담접수'),
                        start_date: now, // 인입일(start_date) 필수로 채움
                        is_visible: true, // 가시성 활성화
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
        }
    }

    console.log('\n--- 마이그레이션 v3 최종 결과 ---');
    console.log(`- 전체 스페이스: ${entries.length}`);
    console.log(`- 매칭/업데이트: ${updatedCount}`);
    console.log(`- 신규 생성: ${insertedCount}`);
    console.log(`- 스킵: ${skippedCount}`);
    console.log(`- 에러: ${errorCount}`);
}

migrate();
