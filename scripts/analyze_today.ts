
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const today = new Date().toISOString().split('T')[0];
    let all = []; let from = 0;
    while (true) {
        const { data } = await s.from('consultations').select('id, project_name, start_date, metadata, created_at').range(from, from + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        from += 1000;
    }
    const todayMigrations = all.filter(l => l.created_at.startsWith(today));

    console.log('--- 오늘 생성된 데이터 정밀 분석 ---');
    console.log('전체 건수:', todayMigrations.length);

    const withDate = todayMigrations.filter(l => l.start_date !== null);
    console.log('인입일이 남아있는 건수:', withDate.length);
    if (withDate.length > 0) {
        console.log('샘플 (인입일 잔여):', JSON.stringify(withDate.slice(0, 5), null, 2));
    }

    const hasChatUrl = todayMigrations.filter(l => l.metadata?.google_chat_url);
    console.log('링크가 있는 건수:', hasChatUrl.length);
    console.log('링크 샘플:', JSON.stringify(hasChatUrl.slice(0, 3).map(l => ({ name: l.project_name, url: l.metadata.google_chat_url })), null, 2));
} run();
