// 학생 인터페이스 로직 - Supabase 버전
const StudentInterface = {
    currentProject: null,
    allProjects: [],
    searchTerm: '',
    sortBy: 'newest',
    selectedImages: [],
    editMode: null, // 'new', 'edit', 'resubmit', 'improve'

    // 템플릿 관련 상태
    templates: [],
    selectedTemplate: null,
    templateGradeFilter: '',
    templateDomainFilter: '',

    async init() {
        // Supabase 세션 확인
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        // 사용자 프로필 로드 대기
        await this.waitForAuth();

        const user = AuthManager.getCurrentUser();
        if (!user || !AuthManager.isStudent()) {
            window.location.href = 'index.html';
            return;
        }

        this.setupEventListeners();
        await this.loadProjects();

        // 실시간 구독 시작
        this.setupRealtimeSubscription();
    },

    async waitForAuth() {
        return new Promise((resolve) => {
            const checkAuth = () => {
                if (AuthManager.getCurrentUser()) {
                    resolve();
                } else {
                    setTimeout(checkAuth, 100);
                }
            };
            checkAuth();
        });
    },

    setupEventListeners() {
        // 새 프로젝트 버튼 - 템플릿 선택 화면으로 이동
        const newProjectBtn = document.getElementById('newProjectBtn');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', () => this.showTemplateSelectSection());
        }

        // 템플릿 선택 취소 버튼
        const cancelTemplateSelectBtn = document.getElementById('cancelTemplateSelectBtn');
        if (cancelTemplateSelectBtn) {
            cancelTemplateSelectBtn.addEventListener('click', () => this.hideTemplateSelectSection());
        }

        // 템플릿 필터
        const templateGradeFilter = document.getElementById('templateGradeFilter');
        if (templateGradeFilter) {
            templateGradeFilter.addEventListener('change', (e) => {
                this.templateGradeFilter = e.target.value;
                this.renderTemplates();
            });
        }

        const templateDomainFilter = document.getElementById('templateDomainFilter');
        if (templateDomainFilter) {
            templateDomainFilter.addEventListener('change', (e) => {
                this.templateDomainFilter = e.target.value;
                this.renderTemplates();
            });
        }

        // 피드백 요청에서 재제출 버튼
        const resubmitFromFeedbackBtn = document.getElementById('resubmitFromFeedbackBtn');
        if (resubmitFromFeedbackBtn) {
            resubmitFromFeedbackBtn.addEventListener('click', () => this.handleResubmitFromFeedback());
        }

        // 피드백에서 목록으로 버튼
        const backToListFromFeedback = document.getElementById('backToListFromFeedback');
        if (backToListFromFeedback) {
            backToListFromFeedback.addEventListener('click', () => showSection('projects'));
        }

        // 개선안 제출 버튼
        const submitImprovementBtn = document.getElementById('submitImprovementBtn');
        if (submitImprovementBtn) {
            submitImprovementBtn.addEventListener('click', () => this.submitImprovement());
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

        // 제출 취소 버튼
        const withdrawBtn = document.getElementById('withdrawBtn');
        if (withdrawBtn) {
            withdrawBtn.addEventListener('click', () => this.handleWithdraw());
        }

        // pending 상태에서 수정하기 버튼
        const editPendingBtn = document.getElementById('editPendingBtn');
        if (editPendingBtn) {
            editPendingBtn.addEventListener('click', () => this.handleEditPending());
        }

        // 재제출 버튼
        const resubmitBtn = document.getElementById('resubmitBtn');
        if (resubmitBtn) {
            resubmitBtn.addEventListener('click', () => this.handleResubmit());
        }

        // 거부됨에서 목록으로 버튼
        const backToListFromRejected = document.getElementById('backToListFromRejected');
        if (backToListFromRejected) {
            backToListFromRejected.addEventListener('click', () => {
                showSection('projects');
            });
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

        // 이미지 선택 버튼
        const selectImagesBtn = document.getElementById('selectImagesBtn');
        const imageInput = document.getElementById('imageInput');
        if (selectImagesBtn && imageInput) {
            selectImagesBtn.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => this.handleImageSelect(e));
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
        const user = AuthManager.getCurrentUser();
        if (!user) return;

        ProjectManager.subscribeToProjectChanges(user.id, (oldData, newData) => {
            if (oldData.status !== newData.status) {
                if (newData.status === 'approved') {
                    Toast.success(`"${newData.title}" 프로젝트가 승인되었습니다!`);
                } else if (newData.status === 'rejected') {
                    Toast.warning(`"${newData.title}" 프로젝트가 거부되었습니다.`);
                } else if (newData.status === 'feedback_requested') {
                    Toast.info(`"${newData.title}" 프로젝트에 교사 피드백이 도착했습니다. 수정 후 재제출해주세요.`);
                }
                this.loadProjects();
            }
        });
    },

    async loadProjects() {
        try {
            if (typeof Loading !== 'undefined') {
                Loading.show('프로젝트 로딩 중...');
            }
            this.allProjects = await ProjectManager.getMyProjects();
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
                <p><strong>생성일:</strong> ${new Date(project.created_at).toLocaleDateString('ko-KR')}</p>
                <p><strong>프롬프트:</strong> ${project.prompt.substring(0, 50)}${project.prompt.length > 50 ? '...' : ''}</p>
                ${project.project_images && project.project_images.length > 0 ? `
                    <p><strong>첨부 이미지:</strong> ${project.project_images.length}개</p>
                ` : ''}
                ${project.status === 'rejected' && project.rejection_reason ? `
                    <p class="text-red-600"><strong>거부 사유:</strong> ${project.rejection_reason}</p>
                ` : ''}
                ${project.status === 'feedback_requested' && project.teacher_feedback ? `
                    <p class="text-amber-600"><strong>교사 피드백:</strong> ${project.teacher_feedback.substring(0, 100)}${project.teacher_feedback.length > 100 ? '...' : ''}</p>
                ` : ''}
                <div class="project-card-actions">
                    <button class="btn btn-primary btn-view" data-id="${project.id}">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                        보기
                    </button>
                    ${project.status === 'pending' ? `
                        <button class="btn btn-warning btn-withdraw" data-id="${project.id}">
                            <i data-lucide="undo-2" class="w-4 h-4"></i>
                            취소
                        </button>
                    ` : ''}
                    ${project.status === 'rejected' || project.status === 'withdrawn' ? `
                        <button class="btn btn-primary btn-resubmit" data-id="${project.id}">
                            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                            재제출
                        </button>
                    ` : ''}
                    ${project.status === 'feedback_requested' ? `
                        <button class="btn btn-warning btn-feedback-resubmit" data-id="${project.id}">
                            <i data-lucide="edit-3" class="w-4 h-4"></i>
                            수정 후 재제출
                        </button>
                    ` : ''}
                    ${project.status === 'approved' ? `
                        <button class="btn btn-success btn-improve" data-id="${project.id}">
                            <i data-lucide="arrow-up-circle" class="w-4 h-4"></i>
                            개선
                        </button>
                        <button class="btn btn-secondary btn-history" data-id="${project.id}">
                            <i data-lucide="history" class="w-4 h-4"></i>
                            히스토리
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
        this.attachProjectCardListeners(projectList);

        // 아이콘 업데이트
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    attachProjectCardListeners(projectList) {
        projectList.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openProject(btn.dataset.id);
            });
        });

        projectList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteProject(btn.dataset.id);
            });
        });

        projectList.querySelectorAll('.btn-withdraw').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.withdrawProject(btn.dataset.id);
            });
        });

        projectList.querySelectorAll('.btn-resubmit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openProjectForResubmit(btn.dataset.id);
            });
        });

        projectList.querySelectorAll('.btn-feedback-resubmit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openProjectForFeedbackResubmit(btn.dataset.id);
            });
        });

        projectList.querySelectorAll('.btn-improve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openProjectForImprovement(btn.dataset.id);
            });
        });

        projectList.querySelectorAll('.btn-history').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openProjectHistory(btn.dataset.id);
            });
        });
    },

    // 이미지 선택 처리
    handleImageSelect(event) {
        const files = Array.from(event.target.files);
        const maxFiles = 5;
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (this.selectedImages.length + files.length > maxFiles) {
            Toast.warning(`최대 ${maxFiles}개의 이미지만 첨부할 수 있습니다.`);
            return;
        }

        for (const file of files) {
            if (file.size > maxSize) {
                Toast.warning(`${file.name}은 5MB를 초과합니다.`);
                continue;
            }
            if (!file.type.startsWith('image/')) {
                Toast.warning(`${file.name}은 이미지 파일이 아닙니다.`);
                continue;
            }
            this.selectedImages.push(file);
        }

        this.renderImagePreviews();
        event.target.value = ''; // 같은 파일 다시 선택 가능하도록
    },

    renderImagePreviews() {
        const container = document.getElementById('imagePreviewContainer');
        if (!container) return;

        if (this.selectedImages.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.selectedImages.map((file, index) => {
            const url = URL.createObjectURL(file);
            return `
                <div class="image-preview-item">
                    <img src="${url}" alt="${file.name}">
                    <button type="button" class="remove-image-btn" data-index="${index}">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                    <span class="image-name">${file.name}</span>
                </div>
            `;
        }).join('');

        // 삭제 버튼 이벤트
        container.querySelectorAll('.remove-image-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.selectedImages.splice(index, 1);
                this.renderImagePreviews();
            });
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    showPromptSection(mode = 'new') {
        this.editMode = mode;
        this.selectedImages = [];

        const section = document.getElementById('promptSection');
        const title = document.getElementById('promptSectionTitle');

        section.classList.remove('hidden');

        if (mode === 'new') {
            title.textContent = '프롬프트 제출';
            document.getElementById('projectTitle').value = '';
            document.getElementById('promptInput').value = '';
            this.currentProject = null;
        } else if (mode === 'edit' || mode === 'resubmit') {
            title.textContent = mode === 'resubmit' ? '프롬프트 재제출' : '프롬프트 수정';
        } else if (mode === 'improve') {
            title.textContent = '프롬프트 개선';
        }

        this.renderImagePreviews();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    hidePromptSection() {
        document.getElementById('promptSection').classList.add('hidden');
        this.selectedImages = [];
        this.editMode = null;
        showSection('projects');
    },

    async handleSubmitPrompt() {
        const title = document.getElementById('projectTitle').value.trim();
        const prompt = document.getElementById('promptInput').value.trim();

        if (!title || !prompt) {
            Toast.warning('제목과 프롬프트를 모두 입력해주세요.');
            return;
        }

        const submitBtn = document.getElementById('submitPromptBtn');
        submitBtn.disabled = true;

        try {
            Loading.show('AI가 평가 중입니다...');

            // 1. AI 평가 (제목, 프롬프트, 템플릿 ID 전달)
            const templateId = this.selectedTemplate?.id || null;
            const evaluation = await ProjectManager.evaluatePrompt(prompt, title, templateId);

            // 2. 프로젝트 생성 또는 업데이트
            let project;

            if (this.editMode === 'new') {
                if (!this.selectedTemplate) {
                    Toast.warning('템플릿을 먼저 선택해주세요.');
                    return;
                }
                project = await ProjectManager.createProject({
                    title,
                    prompt,
                    evaluation,
                    template_id: this.selectedTemplate.id
                });
            } else if (this.editMode === 'resubmit') {
                project = await ProjectManager.resubmitProject(this.currentProject.id, {
                    prompt,
                    evaluation
                });
            } else if (this.editMode === 'improve') {
                project = await ProjectManager.improveProject(this.currentProject.id, {
                    prompt,
                    evaluation
                });
            } else {
                // edit (pending 상태에서 수정)
                project = await ProjectManager.updateProject(this.currentProject.id, {
                    title,
                    prompt,
                    evaluation,
                    status: 'pending'
                });
            }

            // 3. 이미지 업로드
            if (this.selectedImages.length > 0) {
                await ProjectManager.uploadImages(project.id, this.selectedImages);
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            // 4. 평가 결과 표시
            ProjectManager.renderEvaluationResult(evaluation);
            document.getElementById('promptSection').classList.add('hidden');
            document.getElementById('evaluationSection').classList.remove('hidden');

            Toast.success(this.editMode === 'new' ? '프로젝트가 제출되었습니다!' : '프로젝트가 업데이트되었습니다!');

            // 5. 프로젝트 목록 새로고침
            await this.loadProjects();

        } catch (error) {
            Toast.error('오류가 발생했습니다: ' + error.message);
            console.error(error);
        } finally {
            submitBtn.disabled = false;
            Loading.hide();
        }
    },

    async handleWithdraw() {
        if (!this.currentProject) return;

        const confirmed = await Modal.confirm(
            '제출을 취소하시겠습니까?\n취소 후 수정하여 재제출할 수 있습니다.',
            '제출 취소'
        );

        if (!confirmed) return;

        try {
            Loading.show('취소 중...');
            await ProjectManager.withdrawProject(this.currentProject.id);
            Toast.success('제출이 취소되었습니다.');
            await this.loadProjects();
            showSection('projects');
        } catch (error) {
            Toast.error('취소에 실패했습니다: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    async withdrawProject(projectId) {
        const confirmed = await Modal.confirm(
            '제출을 취소하시겠습니까?\n취소 후 수정하여 재제출할 수 있습니다.',
            '제출 취소'
        );

        if (!confirmed) return;

        try {
            Loading.show('취소 중...');
            await ProjectManager.withdrawProject(projectId);
            Toast.success('제출이 취소되었습니다.');
            await this.loadProjects();
        } catch (error) {
            Toast.error('취소에 실패했습니다: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    handleEditPending() {
        if (!this.currentProject) return;
        this.showPromptSection('edit');
        document.getElementById('projectTitle').value = this.currentProject.title;
        document.getElementById('promptInput').value = this.currentProject.prompt;
    },

    handleResubmit() {
        if (!this.currentProject) return;
        this.showPromptSection('resubmit');
        document.getElementById('projectTitle').value = this.currentProject.title;
        document.getElementById('promptInput').value = this.currentProject.prompt;
    },

    async openProjectForResubmit(projectId) {
        try {
            Loading.show('프로젝트 로딩 중...');
            const project = await ProjectManager.getProject(projectId);
            if (!project) {
                Toast.error('프로젝트를 찾을 수 없습니다.');
                return;
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            this.showPromptSection('resubmit');
            document.getElementById('projectTitle').value = project.title;
            document.getElementById('promptInput').value = project.prompt;
            Toast.info('프롬프트를 수정하고 다시 제출하세요.');
        } catch (error) {
            Toast.error('프로젝트를 불러오는데 실패했습니다.');
            console.error(error);
        } finally {
            Loading.hide();
        }
    },

    async openProject(projectId) {
        try {
            Loading.show('프로젝트 로딩 중...');

            const project = await ProjectManager.getProject(projectId);
            if (!project) {
                Toast.error('프로젝트를 찾을 수 없습니다.');
                return;
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            // 상태에 따라 다른 섹션 표시
            this.hideAllSections();

            if (project.status === 'approved' && project.html_content) {
                ProjectManager.renderGeneratedContent(project.html_content);
                document.getElementById('contentSection').classList.remove('hidden');
            } else if (project.status === 'rejected') {
                document.getElementById('rejectionReason').textContent = project.rejection_reason || '사유가 제공되지 않았습니다.';
                document.getElementById('rejectedSection').classList.remove('hidden');
            } else if (project.status === 'feedback_requested') {
                document.getElementById('teacherFeedbackContent').textContent = project.teacher_feedback || '피드백 내용이 없습니다.';
                if (project.feedback_requested_at) {
                    document.getElementById('feedbackRequestedAt').textContent =
                        `피드백 요청 시간: ${new Date(project.feedback_requested_at).toLocaleString('ko-KR')}`;
                }
                document.getElementById('feedbackRequestedSection').classList.remove('hidden');
            } else if (project.status === 'pending') {
                if (project.evaluation) {
                    ProjectManager.renderEvaluationResult(project.evaluation);
                }
                document.getElementById('evaluationSection').classList.remove('hidden');
            } else if (project.status === 'withdrawn') {
                Toast.info('취소된 프로젝트입니다. 재제출하시겠습니까?');
                await this.openProjectForResubmit(projectId);
                return;
            }

        } catch (error) {
            Toast.error('프로젝트를 불러오는데 실패했습니다.');
            console.error(error);
        } finally {
            Loading.hide();
        }
    },

    hideAllSections() {
        ['templateSelectSection', 'promptSection', 'evaluationSection', 'contentSection', 'historySection', 'rejectedSection', 'feedbackRequestedSection'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    },

    handleImprove() {
        if (!this.currentProject) {
            Toast.warning('프로젝트를 먼저 선택해주세요.');
            return;
        }

        // 개선 모달 사용
        this.openImprovementModal();
    },

    async openProjectForImprovement(projectId) {
        try {
            Loading.show('프로젝트 로딩 중...');
            const project = await ProjectManager.getProject(projectId);
            if (!project) {
                Toast.error('프로젝트를 찾을 수 없습니다.');
                return;
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            // 템플릿 정보가 있으면 로드
            if (project.template_id) {
                const template = await ProjectManager.getTemplate(project.template_id);
                if (template) {
                    this.selectedTemplate = template;
                }
            }

            // 개선 모달 사용
            this.openImprovementModal();
            Toast.info('프롬프트를 수정하고 개선 이유를 작성해주세요.');
        } catch (error) {
            Toast.error('프로젝트를 불러오는데 실패했습니다.');
            console.error(error);
        } finally {
            Loading.hide();
        }
    },

    async showHistory() {
        if (!this.currentProject) {
            Toast.warning('프로젝트를 먼저 선택해주세요.');
            return;
        }

        try {
            Loading.show('히스토리 로딩 중...');

            const versions = await ProjectManager.getVersions(this.currentProject.id);
            const historyList = document.getElementById('historyList');

            if (versions.length === 0) {
                historyList.innerHTML = '<p class="info-text">아직 히스토리가 없습니다.</p>';
            } else {
                historyList.innerHTML = versions.map((version, index) => `
                    <div class="history-item" data-version-id="${version.id}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h3>버전 ${version.version_number || versions.length - index}</h3>
                            ${ProjectManager.getStatusBadge(version.status)}
                        </div>
                        <div class="version-info">
                            <strong>생성일:</strong> ${new Date(version.created_at).toLocaleString('ko-KR')}
                        </div>
                        ${version.improvement_reason ? `
                            <div class="improvement-reason-box glass" style="margin-top: 10px; padding: 10px; border-left: 3px solid #10b981;">
                                <strong><i data-lucide="message-square-text" class="w-4 h-4 inline"></i> 개선 이유:</strong>
                                <p class="text-sm mt-1">${version.improvement_reason}</p>
                            </div>
                        ` : index === versions.length - 1 ? `
                            <div class="improvement-reason-box glass" style="margin-top: 10px; padding: 10px; border-left: 3px solid #6b7280;">
                                <span class="text-sm text-gray-500">(최초 제출)</span>
                            </div>
                        ` : ''}
                        <div class="prompt-text" style="margin-top: 10px;">
                            <strong>프롬프트:</strong><br>
                            ${version.prompt}
                        </div>
                        ${version.evaluation ? `
                            <div class="evaluation-info" style="margin-top: 10px;">
                                <strong>평가 점수:</strong> ${version.evaluation.scores?.overall || version.evaluation.overall_score || 'N/A'}/10
                            </div>
                        ` : ''}
                        ${version.html_content ? `
                            <div style="margin-top: 10px;">
                                <button class="btn btn-primary btn-view-content" data-content="${encodeURIComponent(version.html_content)}">
                                    <i data-lucide="eye" class="w-4 h-4"></i>
                                    생성된 콘텐츠 보기
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `).join('');

                historyList.querySelectorAll('.btn-view-content').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const htmlContent = decodeURIComponent(btn.dataset.content);
                        this.showVersionContent(htmlContent);
                    });
                });
            }

            this.hideAllSections();
            document.getElementById('historySection').classList.remove('hidden');

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

        } catch (error) {
            Toast.error('히스토리를 불러오는데 실패했습니다.');
            console.error(error);
        } finally {
            Loading.hide();
        }
    },

    hideHistory() {
        document.getElementById('historySection').classList.add('hidden');
        if (this.currentProject && this.currentProject.html_content) {
            document.getElementById('contentSection').classList.remove('hidden');
        }
    },

    async openProjectHistory(projectId) {
        try {
            Loading.show('프로젝트 로딩 중...');
            const project = await ProjectManager.getProject(projectId);
            if (!project) {
                Toast.error('프로젝트를 찾을 수 없습니다.');
                return;
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            await this.showHistory();
        } catch (error) {
            Toast.error('히스토리를 불러오는데 실패했습니다.');
            console.error(error);
        } finally {
            Loading.hide();
        }
    },

    showVersionContent(htmlContent) {
        const newWindow = window.open('', '_blank', 'width=800,height=600');
        if (newWindow) {
            newWindow.document.write(htmlContent);
            newWindow.document.close();
        } else {
            Toast.warning('팝업이 차단되었습니다. 팝업을 허용해주세요.');
        }
    },

    async deleteProject(projectId) {
        const confirmed = await Modal.confirm(
            '정말 이 프로젝트를 삭제하시겠습니까?\n삭제된 프로젝트는 복구할 수 없습니다.',
            '프로젝트 삭제'
        );

        if (!confirmed) return;

        try {
            Loading.show('삭제 중...');
            await ProjectManager.deleteProject(projectId);
            Toast.success('프로젝트가 삭제되었습니다');

            if (this.currentProject && this.currentProject.id === projectId) {
                this.currentProject = null;
                showSection('projects');
            }

            await this.loadProjects();
        } catch (error) {
            Toast.error('프로젝트 삭제에 실패했습니다');
            console.error(error);
        } finally {
            Loading.hide();
        }
    },

    // 활동 로그 로드
    async loadActivityLogs() {
        const container = document.getElementById('activityLogList');
        if (!container) return;

        try {
            container.innerHTML = '<div class="loading"><div class="spinner"></div><p>로딩 중...</p></div>';

            const logs = await ProjectManager.getActivityLogs();

            if (logs.length === 0) {
                container.innerHTML = '<p class="info-text">아직 활동 기록이 없습니다.</p>';
                return;
            }

            container.innerHTML = logs.map(log => `
                <div class="activity-log-item glass">
                    <div class="log-header">
                        <span class="log-action">${ProjectManager.getActionText(log.action)}</span>
                        <span class="log-time">${new Date(log.created_at).toLocaleString('ko-KR')}</span>
                    </div>
                    ${log.projects ? `<p class="log-project">프로젝트: ${log.projects.title}</p>` : ''}
                    ${log.old_status && log.new_status ? `
                        <p class="log-status">
                            ${ProjectManager.getStatusBadge(log.old_status)} → ${ProjectManager.getStatusBadge(log.new_status)}
                        </p>
                    ` : ''}
                </div>
            `).join('');

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } catch (error) {
            container.innerHTML = '<p class="info-text text-red-500">활동 로그를 불러오는데 실패했습니다.</p>';
            console.error(error);
        }
    },

    async showMyReport() {
        const user = AuthManager.getCurrentUser();
        const reportSection = document.getElementById('myReportSection');

        if (!reportSection) return;

        reportSection.classList.remove('hidden');
        reportSection.innerHTML = '<div class="loading"><div class="spinner"></div><p>리포트 생성 중...</p></div>';

        try {
            const projects = await ProjectManager.getMyProjects();

            const approvedProjects = projects.filter(p => p.status === 'approved');
            const rejectedProjects = projects.filter(p => p.status === 'rejected');
            const pendingProjects = projects.filter(p => p.status === 'pending');
            const withdrawnProjects = projects.filter(p => p.status === 'withdrawn');

            const evaluations = projects
                .map(p => p.evaluation)
                .filter(e => e && e.scores?.overall);

            let avgScore = 'N/A';
            let avgCreativity = 'N/A';
            let avgClarity = 'N/A';
            let avgMathRelevance = 'N/A';
            let avgFeasibility = 'N/A';

            if (evaluations.length > 0) {
                avgScore = (evaluations.reduce((sum, e) => sum + (e.scores?.overall || 0), 0) / evaluations.length).toFixed(1);
                avgCreativity = (evaluations.reduce((sum, e) => sum + (e.scores?.creativity || 0), 0) / evaluations.length).toFixed(1);
                avgClarity = (evaluations.reduce((sum, e) => sum + (e.scores?.clarity || 0), 0) / evaluations.length).toFixed(1);
                avgMathRelevance = (evaluations.reduce((sum, e) => sum + (e.scores?.mathRelevance || 0), 0) / evaluations.length).toFixed(1);
                avgFeasibility = (evaluations.reduce((sum, e) => sum + (e.scores?.feasibility || 0), 0) / evaluations.length).toFixed(1);
            }

            let totalVersions = 0;
            let improvementCount = 0;
            for (const project of projects) {
                const versions = await ProjectManager.getVersions(project.id);
                totalVersions += versions.length;
                improvementCount += Math.max(0, versions.length - 1);
            }

            reportSection.innerHTML = `
                <h3>${user.name} 학생 평가 리포트</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
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
                        <div class="score-value" style="color: #ef4444;">${rejectedProjects.length}</div>
                        <div class="score-label">거부됨</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value">${improvementCount}회</div>
                        <div class="score-label">개선 활동</div>
                    </div>
                </div>
                <div class="feedback-text">
                    <h4 style="margin-bottom: 10px;">평가 점수</h4>
                    <p><strong>종합 평균:</strong> ${avgScore}/10</p>
                    <p><strong>창의성:</strong> ${avgCreativity}/10 | <strong>명확성:</strong> ${avgClarity}/10</p>
                    <p><strong>수학 연관성:</strong> ${avgMathRelevance}/10 | <strong>실현 가능성:</strong> ${avgFeasibility}/10</p>
                </div>
                <div class="suggestions-list" style="margin-top: 15px;">
                    <h4 style="margin-bottom: 10px;">프로젝트 목록</h4>
                    ${projects.map((project, index) => `
                        <div style="margin-top: 10px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${index + 1}. ${project.title}</strong><br>
                                <span style="font-size: 12px;">생성일: ${new Date(project.created_at).toLocaleDateString('ko-KR')}
                                ${project.evaluation?.scores?.overall ? ` | 평가: ${project.evaluation.scores.overall}/10` : ''}</span>
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
    },

    // ========== 템플릿 선택 관련 함수 ==========

    async showTemplateSelectSection() {
        this.hideAllSections();
        document.getElementById('projects-section').classList.add('hidden');

        try {
            Loading.show('템플릿 목록 로딩 중...');
            this.templates = await ProjectManager.getTemplates();

            if (this.templates.length === 0) {
                Toast.warning('사용 가능한 템플릿이 없습니다. 교사에게 문의하세요.');
                showSection('projects');
                return;
            }

            this.renderTemplates();
            document.getElementById('templateSelectSection').classList.remove('hidden');

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } catch (error) {
            Toast.error('템플릿 목록을 불러오는데 실패했습니다.');
            console.error(error);
            showSection('projects');
        } finally {
            Loading.hide();
        }
    },

    hideTemplateSelectSection() {
        document.getElementById('templateSelectSection').classList.add('hidden');
        this.selectedTemplate = null;
        showSection('projects');
    },

    renderTemplates() {
        const container = document.getElementById('templateList');
        if (!container) return;

        // 필터 적용
        let filteredTemplates = this.templates.filter(t => t.is_active);

        if (this.templateGradeFilter) {
            filteredTemplates = filteredTemplates.filter(t => t.grade === parseInt(this.templateGradeFilter));
        }

        if (this.templateDomainFilter) {
            filteredTemplates = filteredTemplates.filter(t => t.math_domain === this.templateDomainFilter);
        }

        if (filteredTemplates.length === 0) {
            container.innerHTML = '<p class="info-text">조건에 맞는 템플릿이 없습니다.</p>';
            return;
        }

        container.innerHTML = filteredTemplates.map(template => `
            <div class="template-card glass" data-template-id="${template.id}">
                <div class="template-card-header">
                    <h3>${template.title}</h3>
                    <div class="template-badges">
                        <span class="badge badge-grade">중${template.grade}</span>
                        <span class="badge badge-domain">${ProjectManager.getMathDomainLabel(template.math_domain)}</span>
                    </div>
                </div>
                <div class="template-card-body">
                    ${template.achievement_standard_code ? `
                        <p class="text-sm text-gray-600"><strong>성취기준:</strong> ${template.achievement_standard_code}</p>
                    ` : ''}
                    <p class="text-sm mt-1">${template.achievement_standard.substring(0, 100)}${template.achievement_standard.length > 100 ? '...' : ''}</p>
                    ${template.unit_name ? `
                        <p class="text-xs text-gray-500 mt-1"><strong>단원:</strong> ${template.unit_name}</p>
                    ` : ''}
                </div>
                <div class="template-card-footer">
                    <span class="achievement-badge level-${template.expected_level}">${ProjectManager.getAchievementLevelLabel(template.expected_level)}</span>
                    <button class="btn btn-primary btn-select-template" data-id="${template.id}">
                        <i data-lucide="check" class="w-4 h-4"></i>
                        선택
                    </button>
                </div>
            </div>
        `).join('');

        // 이벤트 리스너 연결
        container.querySelectorAll('.btn-select-template').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectTemplate(btn.dataset.id);
            });
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    async selectTemplate(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) {
            Toast.error('템플릿을 찾을 수 없습니다.');
            return;
        }

        this.selectedTemplate = template;
        this.hideAllSections();
        this.showPromptSection('new');
        this.displaySelectedTemplateInfo(template);
    },

    displaySelectedTemplateInfo(template) {
        const infoSection = document.getElementById('selectedTemplateInfo');
        if (!infoSection) return;

        // 배지들 표시
        const badgesContainer = document.getElementById('templateBadges');
        badgesContainer.innerHTML = `
            <span class="badge badge-grade">중${template.grade}</span>
            <span class="badge badge-domain">${ProjectManager.getMathDomainLabel(template.math_domain)}</span>
            ${template.achievement_standard_code ? `<span class="badge badge-code">${template.achievement_standard_code}</span>` : ''}
        `;

        // 성취기준
        document.getElementById('templateAchievementStandard').textContent = template.achievement_standard;

        // 학습목표
        const objectivesList = document.getElementById('templateLearningObjectives');
        const objectives = Array.isArray(template.learning_objectives) ? template.learning_objectives : [];
        objectivesList.innerHTML = objectives.map(obj => `<li>${obj.content || obj}</li>`).join('');

        // 교사 지침
        document.getElementById('templateGuidelines').textContent = template.guidelines;

        // 기대 성취수준
        const levelSpan = document.getElementById('templateExpectedLevel');
        levelSpan.textContent = ProjectManager.getAchievementLevelLabel(template.expected_level);
        levelSpan.className = `achievement-badge level-${template.expected_level}`;

        infoSection.classList.remove('hidden');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    // ========== 피드백 재제출 관련 함수 ==========

    async openProjectForFeedbackResubmit(projectId) {
        try {
            Loading.show('프로젝트 로딩 중...');
            const project = await ProjectManager.getProject(projectId);
            if (!project) {
                Toast.error('프로젝트를 찾을 수 없습니다.');
                return;
            }

            this.currentProject = project;
            ProjectManager.currentProject = project;

            // 템플릿 정보가 있으면 로드
            if (project.template_id) {
                const template = await ProjectManager.getTemplate(project.template_id);
                if (template) {
                    this.selectedTemplate = template;
                }
            }

            this.openImprovementModal();
            Toast.info('교사 피드백을 참고하여 프롬프트를 수정하세요.');
        } catch (error) {
            Toast.error('프로젝트를 불러오는데 실패했습니다.');
            console.error(error);
        } finally {
            Loading.hide();
        }
    },

    handleResubmitFromFeedback() {
        if (!this.currentProject) return;
        this.openImprovementModal();
    },

    // ========== 개선 모달 관련 함수 ==========

    openImprovementModal() {
        if (!this.currentProject) {
            Toast.warning('프로젝트를 먼저 선택해주세요.');
            return;
        }

        const modal = document.getElementById('improvementReasonModal');
        if (!modal) return;

        // 이전 프롬프트 표시
        document.getElementById('previousPromptDisplay').textContent = this.currentProject.prompt;

        // 개선된 프롬프트 초기값 설정 (현재 프롬프트로)
        document.getElementById('improvedPromptInput').value = this.currentProject.prompt;

        // 개선 이유 초기화
        document.getElementById('improvementReasonInput').value = '';

        modal.classList.remove('hidden');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    closeImprovementModal() {
        const modal = document.getElementById('improvementReasonModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    async submitImprovement() {
        const improvedPrompt = document.getElementById('improvedPromptInput').value.trim();
        const improvementReason = document.getElementById('improvementReasonInput').value.trim();

        if (!improvedPrompt) {
            Toast.warning('개선된 프롬프트를 입력해주세요.');
            return;
        }

        if (!improvementReason) {
            Toast.warning('개선 이유를 입력해주세요. (필수)');
            return;
        }

        const submitBtn = document.getElementById('submitImprovementBtn');
        submitBtn.disabled = true;

        try {
            Loading.show('AI가 평가 중입니다...');

            // 1. AI 평가 (템플릿 ID 포함)
            const templateId = this.selectedTemplate?.id || this.currentProject?.template_id || null;
            const evaluation = await ProjectManager.evaluatePrompt(improvedPrompt, this.currentProject.title, templateId);

            // 2. 프로젝트 개선 (개선 이유 포함)
            const project = await ProjectManager.improveProject(this.currentProject.id, {
                prompt: improvedPrompt,
                evaluation,
                improvementReason
            });

            this.currentProject = project;
            ProjectManager.currentProject = project;

            // 3. 모달 닫기
            this.closeImprovementModal();

            // 4. 평가 결과 표시
            this.hideAllSections();
            ProjectManager.renderEvaluationResult(evaluation);
            document.getElementById('evaluationSection').classList.remove('hidden');

            Toast.success('개선안이 제출되었습니다!');

            // 5. 프로젝트 목록 새로고침
            await this.loadProjects();

        } catch (error) {
            Toast.error('오류가 발생했습니다: ' + error.message);
            console.error(error);
        } finally {
            submitBtn.disabled = false;
            Loading.hide();
        }
    },

    // handleImprove 수정 - 모달 사용
    handleImproveWithModal() {
        if (!this.currentProject) {
            Toast.warning('프로젝트를 먼저 선택해주세요.');
            return;
        }

        this.openImprovementModal();
    }
};

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StudentInterface.init());
} else {
    StudentInterface.init();
}

// 페이지 언로드 시 구독 해제
window.addEventListener('beforeunload', () => {
    ProjectManager.unsubscribe();
});
