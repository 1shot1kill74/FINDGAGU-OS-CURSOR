
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('--- 데이터 반영 현황 집계 ---');

    // 1. 구글챗 링크가 포함된 전체 상담 개수
    const { count: totalLinked, error: err1 } = await supabase
        .from('consultations')
        .select('*', { count: 'exact', head: true })
        .not('metadata->google_chat_url', 'is', null);

    // 2. 이번 마이그레이션으로 생성된 신규 카드 개수
    const { count: totalNew, error: err2 } = await supabase
        .from('consultations')
        .select('*', { count: 'exact', head: true })
        .eq('metadata->>source', 'google_chat_migration');

    if (err1 || err2) {
        console.error('검증 중 오류 발생:', err1 || err2);
        return;
    }

    console.log(`- 구글챗 링크가 연결된 총 상담 건수: ${totalLinked}건`);
    console.log(`- 마이그레이션으로 신규 생성된 카드: ${totalNew}건`);
    console.log(`- 기존 상담 카드에 링크가 업데이트된 건수: ${(totalLinked || 0) - (totalNew || 0)}건`);

    console.log('\n--- 최근 반영 데이터 샘플 (5건) ---');
    const { data: samples } = await supabase
        .from('consultations')
        .select('company_name, metadata')
        .not('metadata->google_chat_url', 'is', null)
        .limit(5);

    samples?.forEach(s => {
        console.log(`[${s.company_name}] -> ${s.metadata?.google_chat_url}`);
    });
}

verify();
