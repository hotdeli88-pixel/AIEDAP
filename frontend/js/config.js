// API 설정
// 배포 후 RENDER_URL을 실제 Render 배포 URL로 변경하세요
const CONFIG = {
    // Render 배포 URL (배포 후 수정 필요)
    RENDER_URL: 'https://aiedap-backend.onrender.com',

    // 로컬 개발 URL
    LOCAL_URL: 'http://localhost:5000',

    // 현재 환경 감지
    isProduction: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1',

    // API Base URL 반환
    getApiUrl() {
        return this.isProduction ? `${this.RENDER_URL}/api` : `${this.LOCAL_URL}/api`;
    }
};

// ProjectManager의 apiBaseUrl 업데이트
if (typeof ProjectManager !== 'undefined') {
    ProjectManager.apiBaseUrl = CONFIG.getApiUrl();
}
