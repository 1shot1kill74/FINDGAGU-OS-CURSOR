
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

const baseDir = '/Users/findgagu/Desktop/GCS_Data/CustomerOwnedData_구글챗 정보/Takeout 2/Google Chat/Users';

async function verifyAll() {
    console.log('--- 전수 조사 시작 (v2) ---');

    // 1. DB 모든 데이터 로드 (페이지네이션)
    let allRows: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        const { data, error } = await supabase.from('consultations').select('*').range(from, from + PAGE - 1);
        if (error) { console.error('DB 조회 에러:', error.message); break; }
        if (!data || data.length === 0) break;
        allRows.push(...data);
        from += PAGE;
    }
    console.log(`DB 로드 완료: 총 ${allRows.length}건`);

    const today = new Date().toISOString().split('T')[0];
    const todayLeads = allRows.filter(l => l.created_at && l.created_at.startsWith(today));
    console.log(`오늘 생성된 데이터: ${todayLeads.length}건`);

    // 2. 인입일(start_date) 체크
    const withDate = todayLeads.filter(l => l.start_date !== null && (l.metadata?.source?.includes('google_chat') || l.metadata?.source === undefined));
    console.log(`인입일이 남은 마이그레이션 의심 건: ${withDate.length}건`);
    if (withDate.length > 0) {
        console.log('인입일 잔여 샘플:', withDate.slice(0, 3).map(l => ({ id: l.id, name: l.project_name, date: l.start_date })));
    }

    // 3. 링크 정합성 체크
    const allSpaces = new Map();
    const users = fs.readdirSync(baseDir);
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

    console.log(`원본 스페이스 데이터: ${allSpaces.size}건`);

    const mismatches = [];
    for (const lead of todayLeads) {
        const url = lead.metadata?.google_chat_url;
        if (url) {
            const spaceId = url.split('/').pop();
            const originalName = allSpaces.get(`Space ${spaceId}`);
            // project_name이 originalName으로 시작하지 않거나 (괄호 번호 제외) 하면 의심
            if (originalName && !lead.project_name.startsWith(originalName)) {
                mismatches.push({
                    id: lead.id,
                    project_name: lead.project_name,
                    originalName,
                    url
                });
            }
        }
    }

    console.log(`링크-스페이스명 불일치 의심: ${mismatches.length}건`);
    if (mismatches.length > 0) {
        console.log('불일치 샘플:', JSON.stringify(mismatches.slice(0, 5), null, 2));
    }
}

verifyAll();
