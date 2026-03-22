
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
    console.log('--- 마이그레이션 시작 ---');

    const users = fs.readdirSync(baseDir);
    const allSpaces = new Map();

    // 1. 모든 스페이스 수집 및 중복 제거
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

    console.log(`총 ${allSpaces.size}개의 고유 스페이스를 찾았습니다.`);

    // 2. 파싱 로직 (Smart Parser)
    let count = 0;
    for (const [groupId, groupName] of allSpaces.entries()) {
        count++;
        if (count % 100 === 0) console.log(`${count}개 처리 중...`);

        const spaceId = groupId.replace('Space ', '');
        const chatUrl = `https://mail.google.com/chat/u/0/#chat/space/${spaceId}`;

        // 정규식 파싱 예: "완료 2408 김해 학원 9574"
        // [상태] [날짜] [지역] [업종/설명] [번호]
        const regex = /^([가-힣]{2,4})\s*(\d{4})?\s*([가-힣]{2,4})?\s*(.*?)\s*(\d{4,})?$/;
        const match = groupName.match(regex);

        let status = '미지정';
        let region = '';
        let category = '';
        let phonePart = '';
        let parsedName = groupName;

        if (match) {
            status = match[1];
            const dateStr = match[2];
            region = match[3] || '';
            category = match[4] || '';
            phonePart = match[5] || '';
        }

        // 3. DB 매칭 및 업데이트/생성
        // 간단하게 업체명이나 연락처로 기존 상담 카드가 있는지 확인 (정교한 매칭은 복잡하므로 여기서는 시연용 기본 로직)
        const { data: existing } = await supabase
            .from('consultations')
            .select('id, metadata')
            .or(`company_name.ilike.%${region}%,company_name.ilike.%${category}%`)
            .limit(1)
            .single();

        if (existing) {
            // 기존 카드 업데이트
            const updatedMetadata = {
                ...(existing.metadata as object || {}),
                google_chat_url: chatUrl,
                parsed_from_chat: {
                    original_name: groupName,
                    status,
                    region,
                    category
                }
            };

            await supabase
                .from('consultations')
                .update({ metadata: updatedMetadata })
                .eq('id', existing.id);
        } else {
            // 매칭되는 게 없으면 신규 생성 (선택 사항)
            // 여기서는 일단 업데이트 위주로 진행하거나, 확실한 경우만 생성
            if (status === '완료' || status === '진행' || status === '견적') {
                const insertData: any = {
                    company_name: parsedName,
                    status: status === '완료' ? '완료' : (status === '견적' ? '접수' : '진행'),
                    metadata: {
                        google_chat_url: chatUrl,
                        source: 'google_chat_migration',
                        parsed_region: region,
                        parsed_category: category
                    }
                };
                // industry 필드가 있으면 활용
                if (category) insertData.industry = category;

                await supabase.from('consultations').insert(insertData);
            }
        }
    }

    console.log('--- 마이그레이션 완료 ---');
}

migrate();
