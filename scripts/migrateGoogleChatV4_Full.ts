
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

async function migrateFullUnique() {
    console.log('--- 구글챗 전수 마이그레이션 (v4.1: Unique Names) ---');

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

    const entries = Array.from(allSpaces.entries());
    console.log(`총 ${entries.length}개의 개별 상담 카드를 유니크하게 생성합니다.`);

    let successCount = 0;
    let errorCount = 0;

    // DB의 기존 project_name들을 미리 캐싱하여 중복 체크 (선택사항, 하지만 배치 삽입 시 유용)
    const { data: existingNames } = await supabase.from('consultations').select('project_name');
    const usedNames = new Set(existingNames?.map(n => n.project_name) || []);

    const batchSize = 50;
    for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);

        const insertData = batch.map(([groupId, groupName]) => {
            const spaceId = groupId.replace('Space ', '');
            const chatUrl = `https://mail.google.com/chat/u/0/#chat/space/${spaceId}`;

            const statusMatch = groupName.match(/^(완료|견적|진행|캔슬|보류|컨택|추가|A\/S|상담)/);
            const statusStr = statusMatch ? statusMatch[1] : '상담';

            let mappedStatus = '상담접수';
            if (statusStr === '완료') mappedStatus = '시공완료';
            else if (statusStr === '견적') mappedStatus = '견적중';
            else if (statusStr === '진행') mappedStatus = '진행중';

            // 중복 방지를 위해 이름 조정
            let uniqueName = groupName;
            let counter = 1;
            while (usedNames.has(uniqueName)) {
                uniqueName = `${groupName} (${counter})`;
                counter++;
            }
            usedNames.add(uniqueName);

            return {
                project_name: uniqueName,
                status: mappedStatus as any,
                start_date: null,
                is_visible: true,
                metadata: {
                    google_chat_url: chatUrl,
                    source: 'google_chat_full_migration_v4',
                    migrated_at: new Date().toISOString(),
                    original_name: groupName,
                    space_id: spaceId
                }
            };
        });

        const { error } = await supabase.from('consultations').insert(insertData);

        if (error) {
            errorCount += batch.length;
            console.error(`Batch ${i / batchSize + 1} Error:`, error.message);
        } else {
            successCount += batch.length;
            if (successCount % 200 === 0 || successCount === entries.length) {
                console.log(`${successCount}/${entries.length} 완료...`);
            }
        }
    }

    console.log('\n--- 최종 마이그레이션 결과 (v4.1) ---');
    console.log(`- 전체 대상: ${entries.length}`);
    console.log(`- 생성 성공: ${successCount}`);
    console.log(`- 생성 실패: ${errorCount}`);
}

migrateFullUnique();
