// Supabase 클라이언트 설정
// 아래 값들을 Supabase 프로젝트 설정에서 가져온 값으로 변경하세요

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // 예: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // 예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Supabase 클라이언트 초기화
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Edge Functions URL
const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Supabase 설정 확인
function isSupabaseConfigured() {
    return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

// 스토리지 URL 생성
function getStorageUrl(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/project-images/${path}`;
}

// 인증된 스토리지 URL 생성
async function getAuthenticatedStorageUrl(path) {
    const { data } = await supabase.storage
        .from('project-images')
        .createSignedUrl(path, 3600); // 1시간 유효
    return data?.signedUrl;
}
