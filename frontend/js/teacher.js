// 교사 인터페이스 로직 - Supabase 버전
// 중학교 수학 22개정 성취기준 기반 프로젝트 템플릿 관리 포함
const TeacherInterface = {
    allProjects: [],
    pendingProjects: [],
    students: [],
    activityLogs: [],
    templates: [],              // 프로젝트 템플릿 목록
    editingTemplateId: null,    // 수정 중인 템플릿 ID
    learningObjectives: [],     // 학습목표 임시 저장
    searchTerm: '',
    sortBy: 'newest',
    selectedStudent: '',
    activityStudentFilter: '',
    activityTypeFilter: '',
    subscription: null,

    async init() {
        // Supabase 설정 확인
        if (!isSupabaseConfigured()) {
            Toast.error('Supabase가 설정되지 않았습니다.');
            return;
        }

        // 세션 확인
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        // 사용자 프로필 확인 대기
        let retries = 0;
        while (!AuthManager.currentUser && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 300));
            retries++;
        }

        if (!AuthManager.currentUser || !AuthManager.isTeacher()) {
            window.location.href = 'index.html';
            return;
        }

        this.setupEventListeners();
        await this.loadData();

        // Realtime 구독 설정
        this.setupRealtimeSubscription();
    },

    setupEventListeners() {
        // 리포트 생성 버튼
        const generateReportBtn = document.getElementById('generateReportBtn');
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => this.generateReport());
        }

        // 학생 필터 (프로젝트)
        const studentFilter = document.getElementById('studentFilter');
        if (studentFilter) {
            studentFilter.addEventListener('change', (e) => {
                this.selectedStudent = e.target.value;
                this.renderStudentProjects();
            });
        }

        // 검색 입력
        const projectSearch = document.getElementById('projectSearch');
        if (projectSearch) {
            projectSearch.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.renderStudentProjects();
            });
        }

        // 정렬 선택
        const projectSort = document.getElementById('projectSort');
        if (projectSort) {
            projectSort.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.renderStudentProjects();
            });
        }

        // 활동 로그 필터
        const activityStudentFilter = document.getElementById('activityStudentFilter');
        if (activityStudentFilter) {
            activityStudentFilter.addEventListener('change', (e) => {
                this.activityStudentFilter = e.target.value;
                this.renderActivityLogs();
            });
        }

        const activityTypeFilter = document.getElementById('activityTypeFilter');
        if (activityTypeFilter) {
            activityTypeFilter.addEventListener('change', (e) => {
                this.activityTypeFilter = e.target.value;
                this.renderActivityLogs();
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

    setupRealtimeSubscription() {
        // pending 프로젝트 변경 구독
        this.subscription = ProjectManager.subscribeToPendingProjects((payload) => {
            console.log('Pending projects changed:', payload);
            this.loadPendingProjects();
        });
    },

    async loadData() {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('데이터 로딩 중...');
            }

            // 병렬로 데이터 로드
            const [pending, all] = await Promise.all([
                ProjectManager.getPendingProjects(),
                ProjectManager.getProjects()
            ]);

            this.pendingProjects = pending;
            this.allProjects = all;

            // 학생 목록 추출
            this.students = [...new Set(all.map(p => ({
                id: p.user_id,
                name: p.users?.name || '알 수 없음'
            })).map(s => JSON.stringify(s)))].map(s => JSON.parse(s));

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

    async loadPendingProjects() {
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

    async loadActivityLogs() {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('활동 로그 로딩 중...');
            }

            this.activityLogs = await ProjectManager.getActivityLogs();
            this.renderActivityLogs();

            // 학생 필터 업데이트
            this.updateActivityStudentFilter();

        } catch (error) {
            console.error('활동 로그 로드 오류:', error);
            if (typeof Toast !== 'undefined') {
                Toast.error('활동 로그를 불러오는데 실패했습니다');
            }
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    updateActivityStudentFilter() {
        const filter = document.getElementById('activityStudentFilter');
        if (!filter) return;

        const uniqueStudents = [...new Set(this.activityLogs
            .filter(log => log.users)
            .map(log => JSON.stringify({ id: log.user_id, name: log.users.name }))
        )].map(s => JSON.parse(s));

        filter.innerHTML = `
            <option value="">전체 학생</option>
            ${uniqueStudents.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        `;
    },

    renderActivityLogs() {
        const container = document.getElementById('activityLogList');
        if (!container) return;

        let logs = [...this.activityLogs];

        // 학생 필터
        if (this.activityStudentFilter) {
            logs = logs.filter(log => log.user_id === this.activityStudentFilter);
        }

        // 활동 유형 필터
        if (this.activityTypeFilter) {
            logs = logs.filter(log => log.action === this.activityTypeFilter);
        }

        if (logs.length === 0) {
            container.innerHTML = '<p class="info-text">활동 로그가 없습니다.</p>';
            return;
        }

        container.innerHTML = logs.map(log => {
            const actionInfo = this.getActionInfo(log.action);
            const date = new Date(log.created_at).toLocaleString('ko-KR');
            const userName = log.users?.name || '알 수 없음';
            const projectTitle = log.projects?.title || '삭제된 프로젝트';

            return `
                <div class="activity-log-item glass" style="padding: 15px; margin-bottom: 10px; border-radius: 12px; border-left: 4px solid ${actionInfo.color};">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="activity-icon" style="color: ${actionInfo.color};">
                                <i data-lucide="${actionInfo.icon}" class="w-5 h-5"></i>
                            </span>
                            <span class="font-semibold">${actionInfo.label}</span>
                        </div>
                        <span class="text-sm text-gray-500">${date}</span>
                    </div>
                    <div class="mt-2">
                        <p><strong>학생:</strong> ${userName}</p>
                        <p><strong>프로젝트:</strong> ${projectTitle}</p>
                        ${log.old_status ? `<p><strong>상태 변경:</strong> ${this.getStatusLabel(log.old_status)} → ${this.getStatusLabel(log.new_status)}</p>` : ''}
                        ${log.details?.rejection_reason ? `<p class="text-red-500"><strong>거부 사유:</strong> ${log.details.rejection_reason}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    getActionInfo(action) {
        const actions = {
            'project_submitted': { label: '프로젝트 제출', icon: 'send', color: '#3b82f6' },
            'project_approved': { label: '프로젝트 승인', icon: 'check-circle', color: '#10b981' },
            'project_rejected': { label: '프로젝트 거부', icon: 'x-circle', color: '#ef4444' },
            'project_withdrawn': { label: '제출 취소', icon: 'undo-2', color: '#f59e0b' },
            'project_resubmitted': { label: '재제출', icon: 'refresh-cw', color: '#8b5cf6' },
            'project_improved': { label: '개선', icon: 'arrow-up-circle', color: '#06b6d4' },
            'feedback_requested': { label: '피드백 요청', icon: 'message-square', color: '#f97316' },
            'template_created': { label: '템플릿 생성', icon: 'layout-template', color: '#8b5cf6' },
            'template_updated': { label: '템플릿 수정', icon: 'edit', color: '#3b82f6' },
            'template_deleted': { label: '템플릿 삭제', icon: 'trash', color: '#ef4444' }
        };
        return actions[action] || { label: action, icon: 'activity', color: '#6b7280' };
    },

    getStatusLabel(status) {
        const labels = {
            'pending': '대기 중',
            'approved': '승인됨',
            'rejected': '거부됨',
            'withdrawn': '취소됨',
            'feedback_requested': '피드백 요청'
        };
        return labels[status] || status;
    },

    renderPendingList() {
        const pendingList = document.getElementById('pendingList');
        if (!pendingList) return;

        if (this.pendingProjects.length === 0) {
            pendingList.innerHTML = '<p class="info-text">승인 대기 중인 프롬프트가 없습니다.</p>';
            return;
        }

        pendingList.innerHTML = this.pendingProjects.map(project => {
            const studentName = project.users?.name || '알 수 없음';
            const evaluation = project.evaluation || {};

            return `
                <div class="pending-item glass" data-project-id="${project.id}" style="padding: 20px; margin-bottom: 15px; border-radius: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <h3 style="font-size: 1.1rem; font-weight: 600;">${project.title}</h3>
                        ${ProjectManager.getStatusBadge(project.status)}
                    </div>
                    <p class="student-name" style="margin-top: 8px;">
                        <strong>학생:</strong> ${studentName}
                    </p>
                    <div class="prompt-text" style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 8px;">
                        <strong>프롬프트:</strong><br>
                        ${project.prompt}
                    </div>
                    ${project.images && project.images.length > 0 ? `
                        <div class="project-images" style="margin-top: 12px;">
                            <strong>첨부 이미지:</strong>
                            <div class="image-gallery" style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                ${project.images.map(img => `
                                    <img src="${getStorageUrl(img.storage_path)}"
                                         alt="${img.original_filename}"
                                         class="project-image-thumb"
                                         style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; cursor: pointer;"
                                         onclick="TeacherInterface.viewImage('${getStorageUrl(img.storage_path)}')">
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${evaluation.scores ? `
                        <div class="evaluation-info" style="margin-top: 12px; padding: 12px; background: rgba(139, 92, 246, 0.1); border-radius: 8px;">
                            <strong>AI 평가:</strong>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-top: 8px;">
                                <div class="score-item-small">창의성: ${evaluation.scores.creativity}/10</div>
                                <div class="score-item-small">명확성: ${evaluation.scores.clarity}/10</div>
                                <div class="score-item-small">수학연관: ${evaluation.scores.mathRelevance}/10</div>
                                <div class="score-item-small">실현가능: ${evaluation.scores.feasibility}/10</div>
                                <div class="score-item-small" style="font-weight: bold;">종합: ${evaluation.scores.overall}/10</div>
                            </div>
                            ${evaluation.feedback ? `<p style="margin-top: 8px;"><strong>피드백:</strong> ${evaluation.feedback}</p>` : ''}
                        </div>
                    ` : ''}
                    <div class="pending-actions" style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="btn btn-success btn-approve" data-id="${project.id}">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            승인
                        </button>
                        <button class="btn btn-warning btn-feedback" data-id="${project.id}" style="background: linear-gradient(135deg, #f97316, #fb923c);">
                            <i data-lucide="message-square" class="w-4 h-4"></i>
                            피드백
                        </button>
                        <button class="btn btn-danger btn-reject" data-id="${project.id}">
                            <i data-lucide="x" class="w-4 h-4"></i>
                            거부
                        </button>
                        <button class="btn btn-secondary btn-detail" data-id="${project.id}">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                            상세
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 이벤트 리스너 연결
        pendingList.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = btn.dataset.id;
                await this.approveProject(projectId);
            });
        });

        pendingList.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = btn.dataset.id;
                await this.rejectProject(projectId);
            });
        });

        pendingList.querySelectorAll('.btn-feedback').forEach(btn => {
            btn.addEventListener('click', () => {
                const projectId = btn.dataset.id;
                this.openFeedbackModal(projectId);
            });
        });

        pendingList.querySelectorAll('.btn-detail').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = btn.dataset.id;
                await this.showProjectDetail(projectId);
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
            ${this.students.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        `;
    },

    renderStudentProjects() {
        const studentProjects = document.getElementById('studentProjects');
        if (!studentProjects) return;

        // 필터링
        let projects = this.selectedStudent
            ? this.allProjects.filter(p => p.user_id === this.selectedStudent)
            : this.allProjects;

        // 검색
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            projects = projects.filter(p =>
                p.title.toLowerCase().includes(term) ||
                p.prompt.toLowerCase().includes(term)
            );
        }

        // 정렬
        projects = this.sortProjects(projects, this.sortBy);

        if (projects.length === 0) {
            studentProjects.innerHTML = `
                <p class="info-text">
                    ${this.searchTerm || this.selectedStudent ? '검색 결과가 없습니다.' : '프로젝트가 없습니다.'}
                </p>
            `;
            return;
        }

        studentProjects.innerHTML = projects.map(project => {
            const studentName = project.users?.name || '알 수 없음';
            const evaluation = project.evaluation || {};

            return `
                <div class="project-card glass" data-project-id="${project.id}" style="padding: 20px; margin-bottom: 15px; border-radius: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <h3 style="font-size: 1.1rem; font-weight: 600;">${project.title}</h3>
                        ${ProjectManager.getStatusBadge(project.status)}
                    </div>
                    <p><strong>학생:</strong> ${studentName}</p>
                    <p><strong>생성일:</strong> ${new Date(project.created_at).toLocaleDateString('ko-KR')}</p>
                    <p><strong>프롬프트:</strong> ${project.prompt.substring(0, 80)}${project.prompt.length > 80 ? '...' : ''}</p>
                    ${evaluation.scores ? `
                        <p><strong>평가 점수:</strong> ${evaluation.scores.overall}/10</p>
                    ` : ''}
                    ${project.rejection_reason ? `
                        <p style="color: #ef4444;"><strong>거부 사유:</strong> ${project.rejection_reason}</p>
                    ` : ''}
                    <div class="project-card-actions" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
                        ${project.status === 'approved' && project.html_content ? `
                            <button class="btn btn-primary btn-view" data-id="${project.id}">
                                <i data-lucide="eye" class="w-4 h-4"></i>
                                콘텐츠 보기
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-detail" data-id="${project.id}">
                            <i data-lucide="info" class="w-4 h-4"></i>
                            상세
                        </button>
                        <button class="btn btn-danger btn-delete" data-id="${project.id}">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                            삭제
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 이벤트 리스너 연결
        studentProjects.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = btn.dataset.id;
                await this.viewContent(projectId);
            });
        });

        studentProjects.querySelectorAll('.btn-detail').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = btn.dataset.id;
                await this.showProjectDetail(projectId);
            });
        });

        studentProjects.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const projectId = btn.dataset.id;
                await this.deleteProject(projectId);
            });
        });

        // 아이콘 업데이트
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    sortProjects(projects, sortBy) {
        const sorted = [...projects];
        switch (sortBy) {
            case 'newest':
                return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            case 'oldest':
                return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            case 'title':
                return sorted.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
            case 'status':
                const statusOrder = { 'pending': 0, 'approved': 1, 'rejected': 2, 'withdrawn': 3 };
                return sorted.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
            default:
                return sorted;
        }
    },

    async showProjectDetail(projectId) {
        try {
            const project = await ProjectManager.getProject(projectId);
            if (!project) {
                Toast.error('프로젝트를 찾을 수 없습니다');
                return;
            }

            const modal = document.getElementById('projectDetailModal');
            const titleEl = document.getElementById('modalProjectTitle');
            const contentEl = document.getElementById('modalProjectContent');

            if (!modal || !contentEl) return;

            const studentName = project.users?.name || '알 수 없음';
            const evaluation = project.evaluation || {};
            const images = project.images || [];
            const versions = await ProjectManager.getVersions(projectId);

            titleEl.textContent = project.title;
            contentEl.innerHTML = `
                <div class="project-detail">
                    <div class="detail-section">
                        <h4 class="flex items-center gap-2 mb-2">
                            <i data-lucide="user" class="w-4 h-4"></i>
                            기본 정보
                        </h4>
                        <p><strong>학생:</strong> ${studentName}</p>
                        <p><strong>상태:</strong> ${ProjectManager.getStatusBadge(project.status)}</p>
                        <p><strong>생성일:</strong> ${new Date(project.created_at).toLocaleString('ko-KR')}</p>
                        <p><strong>수정일:</strong> ${new Date(project.updated_at).toLocaleString('ko-KR')}</p>
                    </div>

                    <div class="detail-section" style="margin-top: 20px;">
                        <h4 class="flex items-center gap-2 mb-2">
                            <i data-lucide="message-square" class="w-4 h-4"></i>
                            프롬프트
                        </h4>
                        <div class="glass" style="padding: 12px; border-radius: 8px;">
                            ${project.prompt}
                        </div>
                    </div>

                    ${images.length > 0 ? `
                        <div class="detail-section" style="margin-top: 20px;">
                            <h4 class="flex items-center gap-2 mb-2">
                                <i data-lucide="image" class="w-4 h-4"></i>
                                첨부 이미지 (${images.length}개)
                            </h4>
                            <div class="image-gallery" style="display: flex; gap: 10px; flex-wrap: wrap;">
                                ${images.map(img => `
                                    <img src="${getStorageUrl(img.storage_path)}"
                                         alt="${img.original_filename}"
                                         style="max-width: 150px; max-height: 150px; object-fit: cover; border-radius: 8px; cursor: pointer;"
                                         onclick="TeacherInterface.viewImage('${getStorageUrl(img.storage_path)}')">
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${evaluation.scores ? `
                        <div class="detail-section" style="margin-top: 20px;">
                            <h4 class="flex items-center gap-2 mb-2">
                                <i data-lucide="sparkles" class="w-4 h-4"></i>
                                AI 평가
                            </h4>
                            <div class="glass" style="padding: 12px; border-radius: 8px;">
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
                                    <div class="score-item"><span class="score-label">창의성</span><span class="score-value">${evaluation.scores.creativity}/10</span></div>
                                    <div class="score-item"><span class="score-label">명확성</span><span class="score-value">${evaluation.scores.clarity}/10</span></div>
                                    <div class="score-item"><span class="score-label">수학연관</span><span class="score-value">${evaluation.scores.mathRelevance}/10</span></div>
                                    <div class="score-item"><span class="score-label">실현가능</span><span class="score-value">${evaluation.scores.feasibility}/10</span></div>
                                    <div class="score-item" style="background: rgba(139, 92, 246, 0.2);"><span class="score-label">종합</span><span class="score-value" style="font-weight: bold;">${evaluation.scores.overall}/10</span></div>
                                </div>
                                ${evaluation.feedback ? `<p style="margin-top: 12px;"><strong>피드백:</strong> ${evaluation.feedback}</p>` : ''}
                                ${evaluation.suggestions && evaluation.suggestions.length > 0 ? `
                                    <div style="margin-top: 12px;">
                                        <strong>개선 제안:</strong>
                                        <ul style="margin-top: 5px; padding-left: 20px;">
                                            ${evaluation.suggestions.map(s => `<li>${s}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}

                    ${project.rejection_reason ? `
                        <div class="detail-section" style="margin-top: 20px;">
                            <h4 class="flex items-center gap-2 mb-2 text-red-500">
                                <i data-lucide="x-circle" class="w-4 h-4"></i>
                                거부 사유
                            </h4>
                            <div class="glass" style="padding: 12px; border-radius: 8px; border-left: 3px solid #ef4444;">
                                ${project.rejection_reason}
                            </div>
                        </div>
                    ` : ''}

                    ${versions.length > 0 ? `
                        <div class="detail-section" style="margin-top: 20px;">
                            <h4 class="flex items-center gap-2 mb-2">
                                <i data-lucide="history" class="w-4 h-4"></i>
                                버전 히스토리 (${versions.length}개)
                            </h4>
                            <div class="versions-list">
                                ${versions.map(v => `
                                    <div class="glass" style="padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                                        <div class="flex justify-between items-center">
                                            <span><strong>버전 ${v.version_number}</strong></span>
                                            <span class="text-sm text-gray-500">${new Date(v.created_at).toLocaleString('ko-KR')}</span>
                                        </div>
                                        <p class="text-sm mt-1">${v.prompt.substring(0, 50)}...</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${project.status === 'approved' && project.html_content ? `
                        <div class="detail-section" style="margin-top: 20px;">
                            <button class="btn btn-primary" onclick="TeacherInterface.viewContent('${projectId}')">
                                <i data-lucide="play" class="w-4 h-4"></i>
                                생성된 콘텐츠 보기
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;

            modal.classList.remove('hidden');

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } catch (error) {
            console.error('프로젝트 상세 로드 오류:', error);
            Toast.error('프로젝트 정보를 불러오는데 실패했습니다');
        }
    },

    closeProjectModal() {
        const modal = document.getElementById('projectDetailModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    viewImage(url) {
        window.open(url, '_blank');
    },

    async approveProject(projectId) {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('콘텐츠 생성 중... (잠시 기다려주세요)');
            }

            await ProjectManager.approveProject(projectId);

            if (typeof Toast !== 'undefined') {
                Toast.success('프로젝트가 승인되었습니다!');
            }

            await this.loadData();

        } catch (error) {
            if (typeof Toast !== 'undefined') {
                Toast.error('프로젝트 승인에 실패했습니다: ' + error.message);
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
                const name = project.users?.name || '알 수 없음';
                const userId = project.user_id;

                if (!studentStats[userId]) {
                    studentStats[userId] = {
                        name: name,
                        total: 0,
                        approved: 0,
                        rejected: 0,
                        pending: 0,
                        withdrawn: 0,
                        scores: [],
                        improvements: 0
                    };
                }
                studentStats[userId].total++;
                if (studentStats[userId][project.status] !== undefined) {
                    studentStats[userId][project.status]++;
                }
                if (project.evaluation && project.evaluation.scores && project.evaluation.scores.overall) {
                    studentStats[userId].scores.push(project.evaluation.scores.overall);
                }

                // 버전 히스토리 조회
                const versions = await ProjectManager.getVersions(project.id);
                studentStats[userId].improvements += Math.max(0, versions.length - 1);
            }

            // 전체 통계
            const totalProjects = projects.length;
            const totalApproved = projects.filter(p => p.status === 'approved').length;
            const totalRejected = projects.filter(p => p.status === 'rejected').length;
            const totalPending = projects.filter(p => p.status === 'pending').length;
            const totalWithdrawn = projects.filter(p => p.status === 'withdrawn').length;

            reportSection.innerHTML = `
                <h3>전체 통계</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    <div class="score-item glass" style="padding: 15px; text-align: center;">
                        <div class="score-value" style="font-size: 2rem;">${totalProjects}</div>
                        <div class="score-label">총 프로젝트</div>
                    </div>
                    <div class="score-item glass" style="padding: 15px; text-align: center;">
                        <div class="score-value" style="font-size: 2rem; color: #10b981;">${totalApproved}</div>
                        <div class="score-label">승인됨</div>
                    </div>
                    <div class="score-item glass" style="padding: 15px; text-align: center;">
                        <div class="score-value" style="font-size: 2rem; color: #f59e0b;">${totalPending}</div>
                        <div class="score-label">대기 중</div>
                    </div>
                    <div class="score-item glass" style="padding: 15px; text-align: center;">
                        <div class="score-value" style="font-size: 2rem; color: #ef4444;">${totalRejected}</div>
                        <div class="score-label">거부됨</div>
                    </div>
                    <div class="score-item glass" style="padding: 15px; text-align: center;">
                        <div class="score-value" style="font-size: 2rem; color: #6b7280;">${totalWithdrawn}</div>
                        <div class="score-label">취소됨</div>
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
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">취소</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">평균점수</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2);">개선횟수</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.values(studentStats).map(stats => {
                                const avgScore = stats.scores.length > 0
                                    ? (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(1)
                                    : 'N/A';
                                return `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                                        <td style="padding: 12px;">${stats.name}</td>
                                        <td style="padding: 12px; text-align: center;">${stats.total}</td>
                                        <td style="padding: 12px; text-align: center; color: #10b981;">${stats.approved}</td>
                                        <td style="padding: 12px; text-align: center; color: #f59e0b;">${stats.pending}</td>
                                        <td style="padding: 12px; text-align: center; color: #ef4444;">${stats.rejected}</td>
                                        <td style="padding: 12px; text-align: center; color: #6b7280;">${stats.withdrawn}</td>
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
    },

    // ============================================
    // 프로젝트 템플릿 관리 (22개정 수학 성취기준 기반)
    // ============================================

    async loadTemplates() {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('템플릿 로딩 중...');
            }

            const gradeFilter = document.getElementById('templateGradeFilter')?.value;
            const domainFilter = document.getElementById('templateDomainFilter')?.value;

            const filters = {};
            if (gradeFilter) filters.grade = parseInt(gradeFilter);
            if (domainFilter) filters.math_domain = domainFilter;

            this.templates = await ProjectManager.getTemplates(filters);
            this.renderTemplates();

        } catch (error) {
            console.error('템플릿 로드 오류:', error);
            if (typeof Toast !== 'undefined') {
                Toast.error('템플릿을 불러오는데 실패했습니다');
            }
        } finally {
            if (typeof Loading !== 'undefined') {
                Loading.hide();
            }
        }
    },

    renderTemplates() {
        const container = document.getElementById('templatesList');
        if (!container) return;

        if (this.templates.length === 0) {
            container.innerHTML = `
                <div class="glass" style="padding: 40px; text-align: center; border-radius: 16px;">
                    <i data-lucide="layout-template" class="w-12 h-12 mx-auto mb-4 opacity-50"></i>
                    <p class="text-gray-600">등록된 템플릿이 없습니다.</p>
                    <button onclick="TeacherInterface.openTemplateModal()" class="btn btn-primary mt-4">
                        <i data-lucide="plus" class="w-5 h-5"></i>
                        첫 템플릿 만들기
                    </button>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = this.templates.map(template => `
            <div class="template-card glass" style="padding: 20px; border-radius: 16px;" data-template-id="${template.id}">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="font-semibold text-lg">${template.title}</h3>
                    <div class="flex gap-2">
                        <span class="px-3 py-1 text-sm rounded-full" style="background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: white;">
                            중${template.grade}
                        </span>
                        <span class="px-3 py-1 text-sm rounded-full glass">
                            ${ProjectManager.getMathDomainLabel(template.math_domain)}
                        </span>
                    </div>
                </div>

                ${template.achievement_standard_code ? `
                    <p class="text-sm text-purple-600 font-medium mb-2">${template.achievement_standard_code}</p>
                ` : ''}

                <p class="text-sm text-gray-600 mb-3">${template.achievement_standard}</p>

                ${template.learning_objectives && template.learning_objectives.length > 0 ? `
                    <div class="mb-3">
                        <p class="text-sm font-medium mb-1">학습목표:</p>
                        <ul class="text-sm text-gray-600 list-disc list-inside">
                            ${template.learning_objectives.slice(0, 2).map(obj => `<li>${obj.content}</li>`).join('')}
                            ${template.learning_objectives.length > 2 ? `<li>외 ${template.learning_objectives.length - 2}개...</li>` : ''}
                        </ul>
                    </div>
                ` : ''}

                <div class="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
                    <div class="text-sm text-gray-500">
                        기대 성취수준: <span class="font-medium">${template.expected_level}</span>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="TeacherInterface.editTemplate('${template.id}')" class="btn btn-secondary btn-sm">
                            <i data-lucide="edit" class="w-4 h-4"></i>
                            수정
                        </button>
                        <button onclick="TeacherInterface.deleteTemplate('${template.id}')" class="btn btn-danger btn-sm">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                            삭제
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    openTemplateModal(templateId = null) {
        this.editingTemplateId = templateId;
        this.learningObjectives = [];

        const modal = document.getElementById('templateModal');
        const titleEl = document.getElementById('templateModalTitle');
        const form = document.getElementById('templateForm');

        if (!modal || !form) return;

        // 폼 초기화
        form.reset();
        document.getElementById('templateId').value = '';
        document.getElementById('learningObjectivesList').innerHTML = '';

        if (templateId) {
            // 수정 모드
            titleEl.textContent = '템플릿 수정';
            this.loadTemplateForEdit(templateId);
        } else {
            // 생성 모드
            titleEl.textContent = '새 프로젝트 템플릿';
            this.addLearningObjective(); // 기본 학습목표 1개 추가
        }

        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    async loadTemplateForEdit(templateId) {
        try {
            const template = await ProjectManager.getTemplate(templateId);
            if (!template) return;

            document.getElementById('templateId').value = template.id;
            document.getElementById('templateTitle').value = template.title;
            document.getElementById('templateMathDomain').value = template.math_domain;
            document.getElementById('templateUnitName').value = template.unit_name || '';
            document.getElementById('templateAchievementCode').value = template.achievement_standard_code || '';
            document.getElementById('templateAchievementStandard').value = template.achievement_standard;
            document.getElementById('templateExpectedLevel').value = template.expected_level || 'B';
            document.getElementById('templateGuidelines').value = template.guidelines;
            document.getElementById('templateAiRestrictions').value = template.ai_restrictions || '';

            // 학년 라디오 버튼
            const gradeRadio = document.querySelector(`input[name="templateGrade"][value="${template.grade}"]`);
            if (gradeRadio) gradeRadio.checked = true;

            // 학습목표 로드
            this.learningObjectives = template.learning_objectives || [];
            this.renderLearningObjectives();

        } catch (error) {
            console.error('템플릿 로드 오류:', error);
            Toast.error('템플릿을 불러오는데 실패했습니다');
        }
    },

    closeTemplateModal() {
        const modal = document.getElementById('templateModal');
        if (modal) modal.classList.add('hidden');
        this.editingTemplateId = null;
        this.learningObjectives = [];
    },

    addLearningObjective() {
        const order = this.learningObjectives.length + 1;
        this.learningObjectives.push({ order, content: '' });
        this.renderLearningObjectives();
    },

    removeLearningObjective(index) {
        this.learningObjectives.splice(index, 1);
        // 순서 재정렬
        this.learningObjectives.forEach((obj, i) => obj.order = i + 1);
        this.renderLearningObjectives();
    },

    renderLearningObjectives() {
        const container = document.getElementById('learningObjectivesList');
        if (!container) return;

        container.innerHTML = this.learningObjectives.map((obj, index) => `
            <div class="flex gap-2 items-center">
                <span class="text-sm font-medium w-6">${obj.order}.</span>
                <input type="text"
                       class="form-control glass-input flex-1"
                       value="${obj.content}"
                       placeholder="학습목표를 입력하세요"
                       onchange="TeacherInterface.updateLearningObjective(${index}, this.value)">
                <button type="button" onclick="TeacherInterface.removeLearningObjective(${index})" class="p-2 text-red-500 hover:bg-red-500/20 rounded-lg">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
        `).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    updateLearningObjective(index, value) {
        if (this.learningObjectives[index]) {
            this.learningObjectives[index].content = value;
        }
    },

    async saveTemplate(event) {
        event.preventDefault();

        const templateId = document.getElementById('templateId').value;
        const gradeRadio = document.querySelector('input[name="templateGrade"]:checked');

        if (!gradeRadio) {
            Toast.error('학년을 선택해주세요');
            return;
        }

        // 학습목표 필터링 (빈 항목 제거)
        const filteredObjectives = this.learningObjectives
            .filter(obj => obj.content.trim())
            .map((obj, i) => ({ order: i + 1, content: obj.content.trim() }));

        const templateData = {
            title: document.getElementById('templateTitle').value.trim(),
            grade: parseInt(gradeRadio.value),
            math_domain: document.getElementById('templateMathDomain').value,
            unit_name: document.getElementById('templateUnitName').value.trim() || null,
            achievement_standard_code: document.getElementById('templateAchievementCode').value.trim() || null,
            achievement_standard: document.getElementById('templateAchievementStandard').value.trim(),
            learning_objectives: filteredObjectives,
            expected_level: document.getElementById('templateExpectedLevel').value,
            guidelines: document.getElementById('templateGuidelines').value.trim(),
            ai_restrictions: document.getElementById('templateAiRestrictions').value.trim() || null
        };

        try {
            if (typeof Loading !== 'undefined') Loading.show('저장 중...');

            if (templateId) {
                await ProjectManager.updateTemplate(templateId, templateData);
                Toast.success('템플릿이 수정되었습니다');
            } else {
                await ProjectManager.createTemplate(templateData);
                Toast.success('템플릿이 생성되었습니다');
            }

            this.closeTemplateModal();
            await this.loadTemplates();

        } catch (error) {
            console.error('템플릿 저장 오류:', error);
            Toast.error('템플릿 저장에 실패했습니다: ' + error.message);
        } finally {
            if (typeof Loading !== 'undefined') Loading.hide();
        }
    },

    async editTemplate(templateId) {
        this.openTemplateModal(templateId);
    },

    async deleteTemplate(templateId) {
        const confirmed = typeof Modal !== 'undefined'
            ? await Modal.confirm('정말 이 템플릿을 삭제하시겠습니까?', '템플릿 삭제')
            : confirm('정말 이 템플릿을 삭제하시겠습니까?');

        if (!confirmed) return;

        try {
            if (typeof Loading !== 'undefined') Loading.show('삭제 중...');

            await ProjectManager.deleteTemplate(templateId);
            Toast.success('템플릿이 삭제되었습니다');
            await this.loadTemplates();

        } catch (error) {
            console.error('템플릿 삭제 오류:', error);
            Toast.error('템플릿 삭제에 실패했습니다');
        } finally {
            if (typeof Loading !== 'undefined') Loading.hide();
        }
    },

    // ============================================
    // 피드백 요청 기능
    // ============================================

    openFeedbackModal(projectId) {
        document.getElementById('feedbackProjectId').value = projectId;
        document.getElementById('feedbackContent').value = '';
        document.getElementById('feedbackModal').classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    closeFeedbackModal() {
        document.getElementById('feedbackModal').classList.add('hidden');
        document.getElementById('feedbackProjectId').value = '';
        document.getElementById('feedbackContent').value = '';
    },

    async submitFeedback() {
        const projectId = document.getElementById('feedbackProjectId').value;
        const feedbackContent = document.getElementById('feedbackContent').value.trim();

        if (!feedbackContent) {
            Toast.error('피드백 내용을 입력해주세요');
            return;
        }

        try {
            if (typeof Loading !== 'undefined') Loading.show('피드백 전송 중...');

            await ProjectManager.requestFeedback(projectId, feedbackContent);

            Toast.success('피드백이 전송되었습니다. 학생이 재제출해야 합니다.');
            this.closeFeedbackModal();
            await this.loadData();

        } catch (error) {
            console.error('피드백 전송 오류:', error);
            Toast.error('피드백 전송에 실패했습니다: ' + error.message);
        } finally {
            if (typeof Loading !== 'undefined') Loading.hide();
        }
    },

    cleanup() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    }
};

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TeacherInterface.init());
} else {
    TeacherInterface.init();
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
    TeacherInterface.cleanup();
});
