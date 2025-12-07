// 학생 인터페이스 로직
const StudentInterface = {
    currentProject: null,
    allProjects: [],
    searchTerm: '',
    sortBy: 'newest',

    async init() {
        // 사용자 확인
        const user = AuthManager.getCurrentUser();
        if (!user || !AuthManager.isStudent()) {
            window.location.href = 'index.html';
            return;
        }

        // DB 초기화 대기
        await DBManager.ensureDB();

        // 학생 정보 저장
        await DBManager.saveStudent({
            name: user.name,
            role: 'student'
        });

        this.setupEventListeners();
        await this.loadProjects();

        // 실시간 상태 업데이트 시작 (10초마다)
        ProjectManager.startPolling(() => this.checkForUpdates(), 10000);
    },

    setupEventListeners() {
        // 새 프로젝트 버튼
        const newProjectBtn = document.getElementById('newProjectBtn');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', () => this.showPromptSection());
        }

        // 프롬프트 제출 버튼
        const submitPromptBtn = document.getElementById('submitPromptBtn');
        if (submitPromptBtn) {
            submitPromptBtn.addEventListener('click', () => this.handleSubmitPrompt());
        }

        // 취소 버튼
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hidePromptSection());
        }

        // 개선하기 버튼
        const improveBtn = document.getElementById('improveBtn');
        if (improveBtn) {
            improveBtn.addEventListener('click', () => this.handleImprove());
        }

        // 히스토리 보기 버튼
        const viewHistoryBtn = document.getElementById('viewHistoryBtn');
        if (viewHistoryBtn) {
            viewHistoryBtn.addEventListener('click', () => this.showHistory());
        }

        // 프로젝트로 돌아가기 버튼
        const backToProjectBtn = document.getElementById('backToProjectBtn');
        if (backToProjectBtn) {
            backToProjectBtn.addEventListener('click', () => this.hideHistory());
        }

        // 내 리포트 보기 버튼
        const viewMyReportBtn = document.getElementById('viewMyReportBtn');
        if (viewMyReportBtn) {
            viewMyReportBtn.addEventListener('click', () => {
                showSection('report');
                this.showMyReport();
            });
        }

        // 검색 입력
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.renderProjects();
            });
        }

        // 정렬 선택
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.renderProjects();
            });
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
    },

    async loadProjects() {
        const user = AuthManager.getCurrentUser();
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('프로젝트 로딩 중...');
            }
            this.allProjects = await ProjectManager.getProjects(user.name);
            this.renderProjects();
        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('프로젝트 목록을 불러오는데 실패했습니다');
            }
            console.error(error);
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    renderProjects() {
        const projectList = document.getElementById('projectList');
        if (!projectList) return;

        // 검색 및 정렬 적용
        let projects = ProjectManager.filterProjects(this.allProjects, this.searchTerm);
        projects = ProjectManager.sortProjects(projects, this.sortBy);

        if (projects.length === 0) {
            projectList.innerHTML = `
                <p class="info-text">
                    ${this.searchTerm ? '검색 결과가 없습니다.' : '아직 프로젝트가 없습니다. 새 프로젝트를 만들어보세요!'}
                </p>
            `;
            return;
        }

        projectList.innerHTML = projects.map(project => `
            <div class="project-card" data-project-id="${project.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h3>${project.title}</h3>
                    ${ProjectManager.getStatusBadge(project.status)}
                </div>
                <p><strong>생성일:</strong> ${new Date(project.created_at || project.createdAt).toLocaleDateString('ko-KR')}</p>
                <p><strong>프롬프트:</strong> ${project.prompt.substring(0, 50)}${project.prompt.length > 50 ? '...' : ''}</p>
                <div class="project-card-actions">
                    <button class="btn btn-primary btn-view" data-id="${project.id}">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                        보기
                    </button>
                    <button class="btn btn-danger btn-delete" data-id="${project.id}">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                        삭제
                    </button>
                </div>
            </div>
        `).join('');

        // 이벤트 리스너 연결
        projectList.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = parseInt(btn.dataset.id);
                this.openProject(projectId);
            });
        });

        projectList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const projectId = parseInt(btn.dataset.id);
                await this.deleteProject(projectId);
            });
        });

        // 아이콘 업데이트
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    async deleteProject(projectId) {
        const confirmed = typeof Modal !== 'undefined'
            ? await Modal.confirm('정말 이 프로젝트를 삭제하시겠습니까?\n삭제된 프로젝트는 복구할 수 없습니다.', '프로젝트 삭제')
            : confirm('정말 이 프로젝트를 삭제하시겠습니까?');

        if (!confirmed) return;

        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('삭제 중...');
            }

            await ProjectManager.deleteProject(projectId);

            if (typeof Toast !== 'undefined') {
                Toast.success('프로젝트가 삭제되었습니다');
            }

            // 현재 프로젝트가 삭제된 프로젝트인 경우 초기화
            if (this.currentProject && this.currentProject.id === projectId) {
                this.currentProject = null;
                showSection('projects');
            }

            await this.loadProjects();
        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('프로젝트 삭제에 실패했습니다');
            }
            console.error(error);
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    async checkForUpdates() {
        const user = AuthManager.getCurrentUser();
        try {
            const projects = await ProjectManager.getProjects(user.name);

            // 상태 변경 확인
            projects.forEach(newProject => {
                const oldProject = this.allProjects.find(p => p.id === newProject.id);
                if (oldProject && oldProject.status !== newProject.status) {
                    if (newProject.status === 'approved') {
                        Toast.success(`"${newProject.title}" 프로젝트가 승인되었습니다!`);
                    } else if (newProject.status === 'rejected') {
                        Toast.warning(`"${newProject.title}" 프로젝트가 거부되었습니다.`);
                    }
                }
            });

            this.allProjects = projects;
            this.renderProjects();
        } catch (error) {
            console.error('업데이트 확인 오류:', error);
        }
    },

    showPromptSection() {
        document.getElementById('promptSection').classList.remove('hidden');
        document.getElementById('projectTitle').value = '';
        document.getElementById('promptInput').value = '';
        this.currentProject = null;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    hidePromptSection() {
        document.getElementById('promptSection').classList.add('hidden');
    },

    async handleSubmitPrompt() {
        const title = document.getElementById('projectTitle').value.trim();
        const prompt = document.getElementById('promptInput').value.trim();

        if (!title || !prompt) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('제목과 프롬프트를 모두 입력해주세요.');
            } else {
                alert('제목과 프롬프트를 모두 입력해주세요.');
            }
            return;
        }

        const user = AuthManager.getCurrentUser();
        const submitBtn = document.getElementById('submitPromptBtn');
        submitBtn.disabled = true;

        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('AI가 평가 중입니다...');
            }

            // 1. AI 평가
            const evaluation = await ProjectManager.evaluatePrompt(prompt, user.name);

            // 2. 프로젝트 생성 또는 업데이트
            let project;
            const isUpdate = !!this.currentProject;

            if (isUpdate) {
                project = await ProjectManager.updateProject(this.currentProject.id, {
                    title: title,
                    prompt: prompt,
                    evaluation: evaluation,
                    status: 'pending'
                });
            } else {
                project = await ProjectManager.createProject({
                    student_name: user.name,
                    title: title,
                    prompt: prompt,
                    evaluation: evaluation
                });
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            // 3. 평가 결과 표시
            ProjectManager.renderEvaluationResult(evaluation);
            document.getElementById('promptSection').classList.add('hidden');
            document.getElementById('evaluationSection').classList.remove('hidden');

            if (typeof Toast !== 'undefined') {
                Toast.success(isUpdate ? '프로젝트가 업데이트되었습니다!' : '프로젝트가 제출되었습니다!');
            }

            // 4. 프로젝트 목록 새로고침
            await this.loadProjects();

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('오류가 발생했습니다: ' + error.message);
            } else {
                alert('오류가 발생했습니다: ' + error.message);
            }
            console.error(error);
        } finally {
            submitBtn.disabled = false;
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    async openProject(projectId) {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('프로젝트 로딩 중...');
            }

            const project = await ProjectManager.getProject(projectId);
            if (!project) {
                if (typeof Toast !== 'undefined') {
                    Toast.error('프로젝트를 찾을 수 없습니다.');
                }
                return;
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            // 프로젝트 정보 표시
            document.getElementById('projectTitle').value = project.title;
            document.getElementById('promptInput').value = project.prompt;

            // 상태에 따라 다른 섹션 표시
            if (project.status === 'approved' && project.html_content) {
                ProjectManager.renderGeneratedContent(project.html_content);
                document.getElementById('contentSection').classList.remove('hidden');
                document.getElementById('evaluationSection').classList.add('hidden');
            } else if (project.evaluation) {
                ProjectManager.renderEvaluationResult(project.evaluation);
                document.getElementById('evaluationSection').classList.remove('hidden');
                document.getElementById('contentSection').classList.add('hidden');
            }

            // 프롬프트 섹션 표시
            document.getElementById('promptSection').classList.remove('hidden');

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('프로젝트를 불러오는데 실패했습니다.');
            }
            console.error(error);
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    handleImprove() {
        if (!this.currentProject) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('프로젝트를 먼저 선택해주세요.');
            }
            return;
        }

        this.showPromptSection();
        document.getElementById('projectTitle').value = this.currentProject.title;
        document.getElementById('promptInput').value = this.currentProject.prompt;
    },

    async showHistory() {
        if (!this.currentProject) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('프로젝트를 먼저 선택해주세요.');
            }
            return;
        }

        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('히스토리 로딩 중...');
            }

            const versions = await ProjectManager.getVersions(this.currentProject.id);
            const historyList = document.getElementById('historyList');

            if (versions.length === 0) {
                historyList.innerHTML = '<p class="info-text">아직 히스토리가 없습니다.</p>';
            } else {
                historyList.innerHTML = versions.map((version, index) => `
                    <div class="history-item">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h3>버전 ${versions.length - index}</h3>
                            ${ProjectManager.getStatusBadge(version.status)}
                        </div>
                        <div class="version-info">
                            <strong>생성일:</strong> ${new Date(version.created_at || version.createdAt).toLocaleString('ko-KR')}
                        </div>
                        <div class="prompt-text" style="margin-top: 10px;">
                            <strong>프롬프트:</strong><br>
                            ${version.prompt}
                        </div>
                        ${version.evaluation ? `
                            <div class="evaluation-info" style="margin-top: 10px;">
                                <strong>평가 점수:</strong> ${version.evaluation.overall_score}/5
                            </div>
                        ` : ''}
                    </div>
                `).join('');
            }

            document.getElementById('contentSection').classList.add('hidden');
            document.getElementById('historySection').classList.remove('hidden');

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('히스토리를 불러오는데 실패했습니다.');
            }
            console.error(error);
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    hideHistory() {
        document.getElementById('historySection').classList.add('hidden');
        if (this.currentProject && (this.currentProject.html_content || this.currentProject.htmlContent)) {
            document.getElementById('contentSection').classList.remove('hidden');
        }
    },

    async showMyReport() {
        const user = AuthManager.getCurrentUser();
        const reportSection = document.getElementById('myReportSection');

        if (!reportSection) return;

        reportSection.classList.remove('hidden');
        reportSection.innerHTML = '<div class="loading"><div class="spinner"></div><p>리포트 생성 중...</p></div>';

        try {
            const projects = await ProjectManager.getProjects(user.name);

            const approvedProjects = projects.filter(p => p.status === 'approved');
            const rejectedProjects = projects.filter(p => p.status === 'rejected');
            const pendingProjects = projects.filter(p => p.status === 'pending');

            // 평균 평가 점수 계산
            const evaluations = projects
                .map(p => p.evaluation)
                .filter(e => e && e.overall_score);

            let avgScore = 'N/A';
            let avgRelevance = 'N/A';
            let avgClarity = 'N/A';
            let avgEducationalValue = 'N/A';
            let avgFeasibility = 'N/A';

            if (evaluations.length > 0) {
                avgScore = (evaluations.reduce((sum, e) => sum + e.overall_score, 0) / evaluations.length).toFixed(2);
                avgRelevance = (evaluations.reduce((sum, e) => sum + (e.scores?.relevance || 0), 0) / evaluations.length).toFixed(2);
                avgClarity = (evaluations.reduce((sum, e) => sum + (e.scores?.clarity || 0), 0) / evaluations.length).toFixed(2);
                avgEducationalValue = (evaluations.reduce((sum, e) => sum + (e.scores?.educational_value || 0), 0) / evaluations.length).toFixed(2);
                avgFeasibility = (evaluations.reduce((sum, e) => sum + (e.scores?.feasibility || 0), 0) / evaluations.length).toFixed(2);
            }

            // 버전 히스토리 조회
            let totalVersions = 0;
            let improvementCount = 0;
            for (const project of projects) {
                const versions = await ProjectManager.getVersions(project.id);
                totalVersions += versions.length;
                improvementCount += Math.max(0, versions.length - 1);
            }

            reportSection.innerHTML = `
                <h3>${user.name} 학생 평가 리포트</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <div class="score-item">
                        <div class="score-value">${projects.length}</div>
                        <div class="score-label">총 프로젝트</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value" style="color: #10b981;">${approvedProjects.length}</div>
                        <div class="score-label">승인됨</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value" style="color: #f59e0b;">${pendingProjects.length}</div>
                        <div class="score-label">대기 중</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value">${improvementCount}회</div>
                        <div class="score-label">개선 활동</div>
                    </div>
                </div>
                <div class="feedback-text">
                    <h4 style="margin-bottom: 10px;">평가 점수</h4>
                    <p><strong>종합 평균:</strong> ${avgScore}/5</p>
                    <p><strong>연관성:</strong> ${avgRelevance}/5 | <strong>명확성:</strong> ${avgClarity}/5</p>
                    <p><strong>교육적 가치:</strong> ${avgEducationalValue}/5 | <strong>실현 가능성:</strong> ${avgFeasibility}/5</p>
                </div>
                <div class="suggestions-list" style="margin-top: 15px;">
                    <h4 style="margin-bottom: 10px;">프로젝트 목록</h4>
                    ${projects.map((project, index) => `
                        <div style="margin-top: 10px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${index + 1}. ${project.title}</strong><br>
                                <span style="font-size: 12px;">생성일: ${new Date(project.createdAt).toLocaleDateString('ko-KR')}
                                ${project.evaluation ? ` | 평가: ${project.evaluation.overall_score}/5` : ''}</span>
                            </div>
                            ${ProjectManager.getStatusBadge(project.status)}
                        </div>
                    `).join('')}
                </div>
            `;

        } catch (error) {
            reportSection.innerHTML = '<p class="info-text">리포트를 생성하는데 실패했습니다.</p>';
            console.error(error);
        }
    }
};

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StudentInterface.init());
} else {
    StudentInterface.init();
}

// 페이지 언로드 시 폴링 중지
window.addEventListener('beforeunload', () => {
    ProjectManager.stopPolling();
});
