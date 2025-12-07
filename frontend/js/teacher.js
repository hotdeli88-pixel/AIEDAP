// 교사 인터페이스 로직
const TeacherInterface = {
    allProjects: [],
    pendingProjects: [],
    students: [],
    searchTerm: '',
    sortBy: 'newest',
    selectedStudent: '',

    async init() {
        // 사용자 확인
        const user = AuthManager.getCurrentUser();
        if (!user || !AuthManager.isTeacher()) {
            window.location.href = 'index.html';
            return;
        }

        // DB 초기화 대기
        await DBManager.ensureDB();

        this.setupEventListeners();
        await this.loadData();

        // 실시간 업데이트 시작 (10초마다)
        ProjectManager.startPolling(() => this.checkForNewPending(), 10000);
    },

    setupEventListeners() {
        // 리포트 생성 버튼
        const generateReportBtn = document.getElementById('generateReportBtn');
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => this.generateReport());
        }

        // 학생 필터
        const studentFilter = document.getElementById('studentFilter');
        if (studentFilter) {
            studentFilter.addEventListener('change', (e) => {
                this.selectedStudent = e.target.value;
                this.renderStudentProjects();
            });
        }

        // 검색 입력
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.renderStudentProjects();
            });
        }

        // 정렬 선택
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.renderStudentProjects();
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

    async loadData() {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('데이터 로딩 중...');
            }

            // 병렬로 데이터 로드
            const [pending, all, students] = await Promise.all([
                ProjectManager.getPendingProjects(),
                ProjectManager.getProjects(),
                ProjectManager.getStudents()
            ]);

            this.pendingProjects = pending;
            this.allProjects = all;
            this.students = students;

            this.renderPendingList();
            this.renderStudentFilter();
            this.renderStudentProjects();

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('데이터를 불러오는데 실패했습니다');
            }
            console.error(error);
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    async checkForNewPending() {
        try {
            const pending = await ProjectManager.getPendingProjects();

            // 새로운 승인 대기 항목 확인
            if (pending.length > this.pendingProjects.length) {
                const newCount = pending.length - this.pendingProjects.length;
                if (typeof Toast !== 'undefined') {
                    Toast.info(`새로운 승인 대기 프로젝트 ${newCount}건이 있습니다`);
                }
            }

            this.pendingProjects = pending;
            this.renderPendingList();

        } catch (error) {
            console.error('업데이트 확인 오류:', error);
        }
    },

    renderPendingList() {
        const pendingList = document.getElementById('pendingList');
        if (!pendingList) return;

        if (this.pendingProjects.length === 0) {
            pendingList.innerHTML = '<p class="info-text">승인 대기 중인 프롬프트가 없습니다.</p>';
            return;
        }

        pendingList.innerHTML = this.pendingProjects.map(project => `
            <div class="pending-item" data-project-id="${project.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h3>${project.title}</h3>
                    ${ProjectManager.getStatusBadge(project.status)}
                </div>
                <p class="student-name">
                    <strong>학생:</strong> ${project.student_name}
                </p>
                <div class="prompt-text">
                    <strong>프롬프트:</strong><br>
                    ${project.prompt}
                </div>
                ${project.evaluation ? `
                    <div class="evaluation-info">
                        <strong>AI 평가 점수:</strong> ${project.evaluation.overall_score}/5<br>
                        <strong>피드백:</strong> ${project.evaluation.feedback || 'N/A'}
                        ${project.evaluation.is_appropriate
                            ? '<br><span style="color: #10b981;">✓ AI가 적절하다고 판단</span>'
                            : '<br><span style="color: #f59e0b;">⚠ AI가 개선이 필요하다고 판단</span>'}
                    </div>
                ` : ''}
                <div class="pending-actions">
                    <button class="btn btn-success btn-approve" data-id="${project.id}" data-prompt="${encodeURIComponent(project.prompt)}" data-student="${encodeURIComponent(project.student_name)}">
                        <i data-lucide="check" class="w-4 h-4"></i>
                        승인
                    </button>
                    <button class="btn btn-danger btn-reject" data-id="${project.id}">
                        <i data-lucide="x" class="w-4 h-4"></i>
                        거부
                    </button>
                </div>
            </div>
        `).join('');

        // 이벤트 리스너 연결
        pendingList.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = parseInt(btn.dataset.id);
                const prompt = decodeURIComponent(btn.dataset.prompt);
                const studentName = decodeURIComponent(btn.dataset.student);
                await this.approveProject(projectId, prompt, studentName);
            });
        });

        pendingList.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = parseInt(btn.dataset.id);
                await this.rejectProject(projectId);
            });
        });

        // 아이콘 업데이트
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    renderStudentFilter() {
        const studentFilter = document.getElementById('studentFilter');
        if (!studentFilter) return;

        studentFilter.innerHTML = `
            <option value="">전체 학생</option>
            ${this.students.map(name => `<option value="${name}">${name}</option>`).join('')}
        `;
    },

    renderStudentProjects() {
        const studentProjects = document.getElementById('studentProjects');
        if (!studentProjects) return;

        // 필터링
        let projects = this.selectedStudent
            ? this.allProjects.filter(p => p.student_name === this.selectedStudent)
            : this.allProjects;

        // 검색
        projects = ProjectManager.filterProjects(projects, this.searchTerm);

        // 정렬
        projects = ProjectManager.sortProjects(projects, this.sortBy);

        if (projects.length === 0) {
            studentProjects.innerHTML = `
                <p class="info-text">
                    ${this.searchTerm || this.selectedStudent ? '검색 결과가 없습니다.' : '프로젝트가 없습니다.'}
                </p>
            `;
            return;
        }

        studentProjects.innerHTML = projects.map(project => `
            <div class="project-card" data-project-id="${project.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h3>${project.title}</h3>
                    ${ProjectManager.getStatusBadge(project.status)}
                </div>
                <p><strong>학생:</strong> ${project.student_name}</p>
                <p><strong>생성일:</strong> ${new Date(project.created_at || project.createdAt).toLocaleDateString('ko-KR')}</p>
                <p><strong>프롬프트:</strong> ${project.prompt.substring(0, 50)}${project.prompt.length > 50 ? '...' : ''}</p>
                ${project.evaluation ? `
                    <p><strong>평가 점수:</strong> ${project.evaluation.overall_score}/5</p>
                ` : ''}
                ${project.rejection_reason ? `
                    <p style="color: #ef4444;"><strong>거부 사유:</strong> ${project.rejection_reason}</p>
                ` : ''}
                <div class="project-card-actions">
                    ${project.status === 'approved' && project.html_content ? `
                        <button class="btn btn-primary btn-view" data-id="${project.id}">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                            콘텐츠 보기
                        </button>
                    ` : ''}
                    <button class="btn btn-danger btn-delete" data-id="${project.id}">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                        삭제
                    </button>
                </div>
            </div>
        `).join('');

        // 이벤트 리스너 연결
        studentProjects.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = parseInt(btn.dataset.id);
                await this.viewContent(projectId);
            });
        });

        studentProjects.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = parseInt(btn.dataset.id);
                await this.deleteProject(projectId);
            });
        });

        // 아이콘 업데이트
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    async approveProject(projectId, prompt, studentName) {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('콘텐츠 생성 중... (잠시 기다려주세요)');
            }

            await ProjectManager.approveProject(projectId, prompt, studentName);

            if (typeof Toast !== 'undefined') {
                Toast.success('프로젝트가 승인되었습니다!');
            }

            await this.loadData();

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('프로젝트 승인에 실패했습니다');
            }
            console.error(error);
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    async rejectProject(projectId) {
        const reason = typeof Modal !== 'undefined'
            ? await Modal.prompt('거부 사유를 입력해주세요:', '프로젝트 거부')
            : prompt('거부 사유를 입력해주세요:');

        if (reason === null) return;

        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('처리 중...');
            }

            await ProjectManager.rejectProject(projectId, reason);

            if (typeof Toast !== 'undefined') {
                Toast.info('프로젝트가 거부되었습니다');
            }

            await this.loadData();

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('프로젝트 거부에 실패했습니다');
            }
            console.error(error);
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
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

            await this.loadData();

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

    async viewContent(projectId) {
        try {
            const project = await ProjectManager.getProject(projectId);
            if (!project || !project.html_content) {
                if (typeof Toast !== 'undefined') {
                    Toast.warning('콘텐츠가 없습니다');
                }
                return;
            }

            // 새 창에서 콘텐츠 열기
            const blob = new Blob([project.html_content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('콘텐츠를 불러오는데 실패했습니다');
            }
            console.error(error);
        }
    },

    async generateReport() {
        const reportSection = document.getElementById('reportSection');
        if (!reportSection) return;

        reportSection.classList.remove('hidden');
        reportSection.innerHTML = '<div class="loading"><div class="spinner"></div><p>리포트 생성 중...</p></div>';

        try {
            const projects = await ProjectManager.getProjects();

            // 학생별 통계 수집
            const studentStats = {};
            for (const project of projects) {
                const name = project.student_name;
                if (!studentStats[name]) {
                    studentStats[name] = {
                        total: 0,
                        approved: 0,
                        rejected: 0,
                        pending: 0,
                        scores: [],
                        improvements: 0
                    };
                }
                studentStats[name].total++;
                studentStats[name][project.status]++;
                if (project.evaluation && project.evaluation.overall_score) {
                    studentStats[name].scores.push(project.evaluation.overall_score);
                }

                // 버전 히스토리 조회
                const versions = await ProjectManager.getVersions(project.id);
                studentStats[name].improvements += Math.max(0, versions.length - 1);
            }

            // 전체 통계
            const totalProjects = projects.length;
            const totalApproved = projects.filter(p => p.status === 'approved').length;
            const totalRejected = projects.filter(p => p.status === 'rejected').length;
            const totalPending = projects.filter(p => p.status === 'pending').length;

            reportSection.innerHTML = `
                <h3>전체 통계</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    <div class="score-item">
                        <div class="score-value">${totalProjects}</div>
                        <div class="score-label">총 프로젝트</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value" style="color: #10b981;">${totalApproved}</div>
                        <div class="score-label">승인됨</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value" style="color: #f59e0b;">${totalPending}</div>
                        <div class="score-label">대기 중</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value" style="color: #ef4444;">${totalRejected}</div>
                        <div class="score-label">거부됨</div>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <button class="btn btn-secondary" onclick="window.print()">
                        <i data-lucide="printer" class="w-4 h-4"></i>
                        인쇄하기
                    </button>
                </div>

                <h3>학생별 성과</h3>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <thead>
                            <tr style="background: rgba(139, 92, 246, 0.2);">
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid rgba(255,255,255,0.2);">학생</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">총</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">승인</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">대기</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">거부</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">평균점수</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">개선횟수</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(studentStats).map(([name, stats]) => {
                                const avgScore = stats.scores.length > 0
                                    ? (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(2)
                                    : 'N/A';
                                return `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                                        <td style="padding: 12px;">${name}</td>
                                        <td style="padding: 12px; text-align: center;">${stats.total}</td>
                                        <td style="padding: 12px; text-align: center; color: #10b981;">${stats.approved}</td>
                                        <td style="padding: 12px; text-align: center; color: #f59e0b;">${stats.pending}</td>
                                        <td style="padding: 12px; text-align: center; color: #ef4444;">${stats.rejected}</td>
                                        <td style="padding: 12px; text-align: center;">${avgScore}</td>
                                        <td style="padding: 12px; text-align: center;">${stats.improvements}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            // 아이콘 업데이트
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

        } catch (error) {
            reportSection.innerHTML = '<p class="info-text">리포트를 생성하는데 실패했습니다.</p>';
            console.error(error);
        }
    }
};

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TeacherInterface.init());
} else {
    TeacherInterface.init();
}

// 페이지 언로드 시 폴링 중지
window.addEventListener('beforeunload', () => {
    ProjectManager.stopPolling();
});
