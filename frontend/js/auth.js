// 인증 관리 모듈
const AuthManager = {
    currentUser: null,
    // 교사 비밀번호 (실제 환경에서는 서버에서 검증해야 함)
    TEACHER_PASSWORD: 'aiedap2024',

    init() {
        this.loadUser();
        this.setupEventListeners();
    },

    setupEventListeners() {
        // 역할 선택 버튼
        const roleButtons = document.querySelectorAll('.role-btn');
        roleButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                roleButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.togglePasswordField();
            });
        });

        // 로그인 버튼
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handleLogin());
        }

        // Enter 키로 로그인
        const userNameInput = document.getElementById('userName');
        if (userNameInput) {
            userNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleLogin();
            });
        }

        const passwordInput = document.getElementById('teacherPassword');
        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleLogin();
            });
        }

        // 로그아웃 버튼
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // 다크 모드 토글
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', () => {
                if (typeof DarkMode !== 'undefined') {
                    DarkMode.toggle();
                }
            });
        }

        // 초기 상태에서 비밀번호 필드 표시/숨김
        this.togglePasswordField();
    },

    togglePasswordField() {
        const passwordGroup = document.getElementById('teacherPasswordGroup');
        const activeRole = document.querySelector('.role-btn.active');

        if (passwordGroup && activeRole) {
            if (activeRole.dataset.role === 'teacher') {
                passwordGroup.classList.remove('hidden');
            } else {
                passwordGroup.classList.add('hidden');
            }
        }
    },

    async handleLogin() {
        const userName = document.getElementById('userName').value.trim();
        const activeRole = document.querySelector('.role-btn.active');

        if (!userName) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('이름을 입력해주세요.');
            } else {
                alert('이름을 입력해주세요.');
            }
            return;
        }

        if (!activeRole) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('역할을 선택해주세요.');
            } else {
                alert('역할을 선택해주세요.');
            }
            return;
        }

        const role = activeRole.dataset.role;

        // 교사 역할일 경우 비밀번호 확인
        if (role === 'teacher') {
            const passwordInput = document.getElementById('teacherPassword');
            const password = passwordInput ? passwordInput.value : '';

            if (!password) {
                if (typeof Toast !== 'undefined') {
                    Toast.warning('교사 비밀번호를 입력해주세요.');
                } else {
                    alert('교사 비밀번호를 입력해주세요.');
                }
                return;
            }

            if (password !== this.TEACHER_PASSWORD) {
                if (typeof Toast !== 'undefined') {
                    Toast.error('비밀번호가 올바르지 않습니다.');
                } else {
                    alert('비밀번호가 올바르지 않습니다.');
                }
                return;
            }
        }

        this.setUser(userName, role);

        if (typeof Toast !== 'undefined') {
            Toast.success(`${userName}님, 환영합니다!`);
        }

        // 역할에 따라 페이지 이동
        setTimeout(() => {
            if (role === 'student') {
                window.location.href = 'student.html';
            } else {
                window.location.href = 'teacher.html';
            }
        }, 500);
    },

    async handleLogout() {
        const confirmed = typeof Modal !== 'undefined'
            ? await Modal.confirm('로그아웃 하시겠습니까?', '로그아웃')
            : confirm('로그아웃 하시겠습니까?');

        if (confirmed) {
            localStorage.removeItem('currentUser');
            if (typeof Toast !== 'undefined') {
                Toast.info('로그아웃되었습니다.');
            }
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 500);
        }
    },

    setUser(name, role) {
        this.currentUser = {
            name: name,
            role: role,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
    },

    loadUser() {
        const userData = localStorage.getItem('currentUser');
        if (userData) {
            this.currentUser = JSON.parse(userData);

            // 현재 페이지에 사용자 정보 표시
            const studentNameEl = document.getElementById('studentName');
            const teacherNameEl = document.getElementById('teacherName');
            const studentNameSidebar = document.getElementById('studentNameSidebar');
            const teacherNameSidebar = document.getElementById('teacherNameSidebar');

            if (studentNameEl && this.currentUser.role === 'student') {
                studentNameEl.textContent = `${this.currentUser.name} 학생`;
            }
            if (teacherNameEl && this.currentUser.role === 'teacher') {
                teacherNameEl.textContent = `${this.currentUser.name} 교사`;
            }
            if (studentNameSidebar && this.currentUser.role === 'student') {
                studentNameSidebar.textContent = this.currentUser.name;
            }
            if (teacherNameSidebar && this.currentUser.role === 'teacher') {
                teacherNameSidebar.textContent = this.currentUser.name;
            }

            // 아이콘 업데이트
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } else {
            // 로그인되지 않은 경우 인덱스 페이지로 리다이렉트 (인덱스 페이지가 아닌 경우)
            if (!window.location.pathname.includes('index.html') &&
                window.location.pathname !== '/' &&
                !window.location.pathname.endsWith('/')) {
                window.location.href = 'index.html';
            }
        }
    },

    getCurrentUser() {
        return this.currentUser;
    },

    isStudent() {
        return this.currentUser && this.currentUser.role === 'student';
    },

    isTeacher() {
        return this.currentUser && this.currentUser.role === 'teacher';
    }
};

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuthManager.init());
} else {
    AuthManager.init();
}
