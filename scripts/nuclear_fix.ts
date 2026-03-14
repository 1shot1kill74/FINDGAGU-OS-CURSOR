
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

const baseDir = '/Users/findgagu/Desktop/GCS_Data/CustomerOwnedData_구글챗 정보/Takeout 2/Google Chat/Users';

async function nuclearFix() {
    console.log('--- 1. Nuclear Cleanup 시작 (0건이 될 때까지) ---');
    let deletedTotal = 0;
    while (true) {
        const { data, count, error } = await supabase.from('consultations')
            .delete({ count: 'exact' })
            .or('metadata->>source.ilike.%google_chat%,metadata->>google_chat_url.not.is.null');

        if (error) { console.error('삭제 에러:', error.message); break; }
        if (count === 0 || count === null) break;
        deletedTotal += count;
        console.log(`- ${count}건 삭제 완료 (누적: ${deletedTotal})`);
        // Wait a bit to avoid rate limit
        await new Promise(r => setTimeout(r, 500));
    }
    console.log(`Cleanup 완료: 총 ${deletedTotal}건 삭제됨.`);

    console.log('--- 2. 원본 데이터 정밀 파싱 ---');
    const allSpaces = new Map<string, string>();
    // 추가적으로 동일 ID에 대해 이름이 여러 개일 경우 가장 긴 이름을 선호하도록 처리
    const users = fs.readdirSync(baseDir);
    for (const userDir of users) {
        const filePath = path.join(baseDir, userDir, 'user_info.json');
        if (fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (data.membership_info) {
                    data.membership_info.forEach((info: any) => {
                        if (info.group_name && info.group_id.startsWith('Space ')) {
                            const currentName = allSpaces.get(info.group_id);
                            if (!currentName || info.group_name.length > currentName.length) {
                                allSpaces.set(info.group_id, info.group_name);
                            }
                        }
                    });
                }
            } catch (e) { }
        }
    }
    console.log(`추출된 유니크 스페이스: ${allSpaces.size}건`);

    console.log('--- 3. 1:1 전수 마이그레이션 (v5) ---');
    const entries = Array.from(allSpaces.entries());
    const usedNames = new Set<string>();

    // 기존 DB 이름들도 체크 (마이그레이션 외 데이터)
    const { data: existing } = await supabase.from('consultations').select('project_name');
    existing?.forEach(e => usedNames.add(e.project_name));

    let successCount = 0;
    const batchSize = 100;
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
                start_date: null, // 명시적으로 null
                is_visible: true,
                metadata: {
                    google_chat_url: chatUrl,
                    source: 'google_chat_v5_final',
                    original_name: groupName,
                    space_id: spaceId,
                    migrated_at: new Date().toISOString()
                }
            };
        });

        const { error } = await supabase.from('consultations').insert(insertData);
        if (error) {
            console.error(`Batch ${i / batchSize} 실패:`, error.message);
        } else {
            successCount += batch.length;
            if (successCount % 500 === 0 || successCount === entries.length) {
                console.log(`${successCount}/${entries.length} 생성 완료...`);
            }
        }
    }

    console.log(`--- 최종 결과 ---`);
    console.log(`총 성공: ${successCount}건`);
}

nuclearFix();
