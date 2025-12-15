// 프로젝트 관리 모듈 - Supabase 버전
const ProjectManager = {
    currentProject: null,
    realtimeSubscription: null,

    // ============================================
    // Edge Functions 호출 (Gemini API)
    // ============================================

    async evaluatePrompt(prompt, title = '프로젝트', templateId = null) {
        try {
            const token = await AuthManager.getAccessToken();
            const body = { prompt, title };

            // 템플릿 ID가 있으면 포함
            if (templateId) {
                body.templateId = templateId;
            }

            const response = await fetch(`${EDGE_FUNCTIONS_URL}/evaluate-prompt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '평가 요청 실패');
            }

            const data = await response.json();
            return data.evaluation;
        } catch (error) {
            console.error('프롬프트 평가 오류:', error);
            throw error;
        }
    },

    async generateContent(prompt) {
        try {
            const token = await AuthManager.getAccessToken();
            const response = await fetch(`${EDGE_FUNCTIONS_URL}/generate-content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '콘텐츠 생성 실패');
            }

            const data = await response.json();
            return data.html_content;
        } catch (error) {
            console.error('콘텐츠 생성 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 프로젝트 CRUD - Supabase Database
    // ============================================

    async createProject(projectData) {
        try {
            const user = AuthManager.getCurrentUser();
            if (!user) throw new Error('로그인이 필요합니다');

            // 템플릿 ID가 없으면 오류 (필수)
            if (!projectData.template_id) {
                throw new Error('템플릿을 선택해주세요');
            }

            const { data, error } = await supabase
                .from('projects')
                .insert({
                    user_id: user.id,
                    template_id: projectData.template_id,  // 템플릿 연결 (필수)
                    title: projectData.title,
                    prompt: projectData.prompt,
                    evaluation: projectData.evaluation,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) throw error;

            // 활동 로그 기록
            await this.logActivity(data.id, 'project_submitted', null, 'pending', {
                title: data.title,
                template_id: projectData.template_id
            });

            return data;
        } catch (error) {
            console.error('프로젝트 생성 오류:', error);
            throw error;
        }
    },

    async updateProject(projectId, updates) {
        try {
            // 현재 프로젝트 상태 확인
            const { data: currentProject } = await supabase
                .from('projects')
                .select('status, prompt, evaluation')
                .eq('id', projectId)
                .single();

            const { data, error } = await supabase
                .from('projects')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .select()
                .single();

            if (error) throw error;

            // 버전 기록 (프롬프트가 변경된 경우)
            if (updates.prompt && updates.prompt !== currentProject?.prompt) {
                await this.createVersion(projectId, {
                    prompt: updates.prompt,
                    evaluation: updates.evaluation,
                    status: updates.status || 'pending'
                });
            }

            return data;
        } catch (error) {
            console.error('프로젝트 업데이트 오류:', error);
            throw error;
        }
    },

    async deleteProject(projectId) {
        try {
            // 관련 이미지 삭제
            await this.deleteProjectImages(projectId);

            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', projectId);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('프로젝트 삭제 오류:', error);
            throw error;
        }
    },

    async getProject(projectId) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select(`
                    *,
                    users(name, email, avatar_url),
                    project_images(id, storage_path, original_filename)
                `)
                .eq('id', projectId)
                .single();

            if (error) throw error;

            // student_name 호환성 유지
            if (data.users) {
                data.student_name = data.users.name;
            }

            return data;
        } catch (error) {
            console.error('프로젝트 조회 오류:', error);
            throw error;
        }
    },

    async getProjects(userId = null) {
        try {
            let query = supabase
                .from('projects')
                .select(`
                    *,
                    users(name, email, avatar_url),
                    project_images(id, storage_path, original_filename)
                `)
                .order('created_at', { ascending: false });

            if (userId) {
                query = query.eq('user_id', userId);
            }

            const { data, error } = await query;

            if (error) throw error;

            // student_name 호환성 유지
            return data.map(project => ({
                ...project,
                student_name: project.users?.name
            }));
        } catch (error) {
            console.error('프로젝트 목록 조회 오류:', error);
            throw error;
        }
    },

    async getMyProjects() {
        const user = AuthManager.getCurrentUser();
        if (!user) return [];
        return this.getProjects(user.id);
    },

    async getPendingProjects() {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select(`
                    *,
                    users(name, email, avatar_url),
                    project_images(id, storage_path, original_filename)
                `)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) throw error;

            return data.map(project => ({
                ...project,
                student_name: project.users?.name
            }));
        } catch (error) {
            console.error('승인 대기 프로젝트 조회 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 상태 변경 (학생)
    // ============================================

    async withdrawProject(projectId) {
        try {
            const user = AuthManager.getCurrentUser();

            const { data, error } = await supabase
                .from('projects')
                .update({
                    status: 'withdrawn',
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .eq('user_id', user.id)
                .eq('status', 'pending')
                .select()
                .single();

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('프로젝트 취소 오류:', error);
            throw error;
        }
    },

    async resubmitProject(projectId, updates) {
        try {
            const user = AuthManager.getCurrentUser();

            // 현재 상태 확인
            const { data: current } = await supabase
                .from('projects')
                .select('status')
                .eq('id', projectId)
                .single();

            if (!['rejected', 'withdrawn', 'feedback_requested'].includes(current?.status)) {
                throw new Error('재제출할 수 없는 상태입니다');
            }

            const { data, error } = await supabase
                .from('projects')
                .update({
                    prompt: updates.prompt,
                    evaluation: updates.evaluation,
                    status: 'pending',
                    rejection_reason: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;

            // 버전 기록
            await this.createVersion(projectId, {
                prompt: updates.prompt,
                evaluation: updates.evaluation,
                status: 'pending'
            });

            return data;
        } catch (error) {
            console.error('프로젝트 재제출 오류:', error);
            throw error;
        }
    },

    async improveProject(projectId, updates) {
        try {
            const user = AuthManager.getCurrentUser();

            const { data, error } = await supabase
                .from('projects')
                .update({
                    prompt: updates.prompt,
                    evaluation: updates.evaluation,
                    status: 'pending',
                    html_content: null,
                    teacher_feedback: null,  // 재제출 시 피드백 초기화
                    feedback_requested_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;

            // 버전 기록 (개선 이유 포함)
            await this.createVersion(projectId, {
                prompt: updates.prompt,
                evaluation: updates.evaluation,
                status: 'pending',
                improvementReason: updates.improvementReason || null
            });

            // 활동 로그 기록
            await this.logActivity(projectId, 'project_improved', null, 'pending', {
                improvement_reason: updates.improvementReason
            });

            return data;
        } catch (error) {
            console.error('프로젝트 개선 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 상태 변경 (교사)
    // ============================================

    async approveProject(projectId) {
        try {
            const token = await AuthManager.getAccessToken();

            // Edge Function 호출 (Gemini로 콘텐츠 생성)
            const response = await fetch(`${EDGE_FUNCTIONS_URL}/approve-project`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ projectId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '프로젝트 승인 실패');
            }

            const data = await response.json();
            return data.project;
        } catch (error) {
            console.error('프로젝트 승인 오류:', error);
            throw error;
        }
    },

    async rejectProject(projectId, rejectionReason) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .update({
                    status: 'rejected',
                    rejection_reason: rejectionReason,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .select()
                .single();

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('프로젝트 거부 오류:', error);
            throw error;
        }
    },

    // 교사 피드백 요청 (재제출 필수)
    async requestFeedback(projectId, feedbackContent) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .update({
                    status: 'feedback_requested',
                    teacher_feedback: feedbackContent,
                    feedback_requested_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .select()
                .single();

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('피드백 요청 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 프로젝트 템플릿 관리 (교사용)
    // 중학교 수학 22개정 성취기준 기반
    // ============================================

    async createTemplate(templateData) {
        try {
            const user = AuthManager.getCurrentUser();
            if (!user) throw new Error('로그인이 필요합니다');

            const { data, error } = await supabase
                .from('project_templates')
                .insert({
                    teacher_id: user.id,
                    title: templateData.title,
                    grade: templateData.grade,
                    math_domain: templateData.math_domain,
                    unit_name: templateData.unit_name,
                    achievement_standard_code: templateData.achievement_standard_code,
                    achievement_standard: templateData.achievement_standard,
                    learning_objectives: templateData.learning_objectives || [],
                    expected_level: templateData.expected_level || 'B',
                    guidelines: templateData.guidelines,
                    ai_restrictions: templateData.ai_restrictions,
                    is_active: true
                })
                .select()
                .single();

            if (error) throw error;

            // 활동 로그 기록
            await this.logActivity(null, 'template_created', null, null, {
                template_id: data.id,
                title: data.title
            });

            return data;
        } catch (error) {
            console.error('템플릿 생성 오류:', error);
            throw error;
        }
    },

    async updateTemplate(templateId, updates) {
        try {
            const { data, error } = await supabase
                .from('project_templates')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', templateId)
                .select()
                .single();

            if (error) throw error;

            await this.logActivity(null, 'template_updated', null, null, {
                template_id: templateId,
                title: data.title
            });

            return data;
        } catch (error) {
            console.error('템플릿 수정 오류:', error);
            throw error;
        }
    },

    async deleteTemplate(templateId) {
        try {
            // Soft delete - is_active를 false로
            const { data, error } = await supabase
                .from('project_templates')
                .update({ is_active: false })
                .eq('id', templateId)
                .select()
                .single();

            if (error) throw error;

            await this.logActivity(null, 'template_deleted', null, null, {
                template_id: templateId
            });

            return { success: true };
        } catch (error) {
            console.error('템플릿 삭제 오류:', error);
            throw error;
        }
    },

    async getTemplates(filters = {}) {
        try {
            let query = supabase
                .from('project_templates')
                .select(`
                    *,
                    users:teacher_id(name, email)
                `)
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            // 학년 필터
            if (filters.grade) {
                query = query.eq('grade', filters.grade);
            }

            // 수학 영역 필터
            if (filters.math_domain) {
                query = query.eq('math_domain', filters.math_domain);
            }

            // 교사 필터
            if (filters.teacher_id) {
                query = query.eq('teacher_id', filters.teacher_id);
            }

            const { data, error } = await query;

            if (error) throw error;

            return data.map(template => ({
                ...template,
                teacher_name: template.users?.name
            }));
        } catch (error) {
            console.error('템플릿 목록 조회 오류:', error);
            throw error;
        }
    },

    async getTemplate(templateId) {
        try {
            const { data, error } = await supabase
                .from('project_templates')
                .select(`
                    *,
                    users:teacher_id(name, email)
                `)
                .eq('id', templateId)
                .single();

            if (error) throw error;

            return {
                ...data,
                teacher_name: data.users?.name
            };
        } catch (error) {
            console.error('템플릿 조회 오류:', error);
            throw error;
        }
    },

    async getMyTemplates() {
        const user = AuthManager.getCurrentUser();
        if (!user) return [];
        return this.getTemplates({ teacher_id: user.id });
    },

    // 템플릿 사용 현황 (해당 템플릿으로 생성된 프로젝트 수)
    async getTemplateUsageCount(templateId) {
        try {
            const { count, error } = await supabase
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('template_id', templateId);

            if (error) throw error;

            return count || 0;
        } catch (error) {
            console.error('템플릿 사용 현황 조회 오류:', error);
            return 0;
        }
    },

    // 수학 영역 라벨 변환
    getMathDomainLabel(domain) {
        const labels = {
            'number_operation': '수와 연산',
            'algebra': '문자와 식',
            'function': '함수',
            'geometry': '기하',
            'statistics': '확률과 통계'
        };
        return labels[domain] || domain;
    },

    // 학년 라벨 변환
    getGradeLabel(grade) {
        return `중${grade}`;
    },

    // 성취수준 라벨 변환
    getAchievementLevelLabel(level) {
        const labels = {
            'A': 'A (탁월)',
            'B': 'B (충분)',
            'C': 'C (보통)',
            'D': 'D (미흡)',
            'E': 'E (매우 미흡)'
        };
        return labels[level] || level;
    },

    // ============================================
    // 버전 관리
    // ============================================

    async createVersion(projectId, versionData) {
        try {
            const { data, error } = await supabase
                .from('versions')
                .insert({
                    project_id: projectId,
                    prompt: versionData.prompt,
                    html_content: versionData.html_content || null,
                    evaluation: versionData.evaluation || null,
                    status: versionData.status,
                    improvement_reason: versionData.improvementReason || null  // 개선 이유 추가
                })
                .select()
                .single();

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('버전 생성 오류:', error);
            throw error;
        }
    },

    async getVersions(projectId) {
        try {
            const { data, error } = await supabase
                .from('versions')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('버전 히스토리 조회 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 활동 로그
    // ============================================

    async logActivity(projectId, action, oldStatus, newStatus, details = {}) {
        try {
            const user = AuthManager.getCurrentUser();

            const { error } = await supabase
                .from('activity_logs')
                .insert({
                    project_id: projectId,
                    user_id: user?.id,
                    action,
                    old_status: oldStatus,
                    new_status: newStatus,
                    details
                });

            if (error) console.error('활동 로그 기록 실패:', error);
        } catch (error) {
            console.error('활동 로그 기록 오류:', error);
        }
    },

    async getActivityLogs(projectId = null) {
        try {
            let query = supabase
                .from('activity_logs')
                .select(`
                    *,
                    users(name),
                    projects(title)
                `)
                .order('created_at', { ascending: false });

            if (projectId) {
                query = query.eq('project_id', projectId);
            }

            const { data, error } = await query;

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('활동 로그 조회 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 이미지 관리
    // ============================================

    async uploadImages(projectId, files) {
        try {
            const user = AuthManager.getCurrentUser();
            const uploadedImages = [];

            for (const file of files) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                const filePath = `${user.id}/${projectId}/${fileName}`;

                // Storage에 업로드
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('project-images')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // 메타데이터 저장
                const { data: imageData, error: dbError } = await supabase
                    .from('project_images')
                    .insert({
                        project_id: projectId,
                        storage_path: filePath,
                        original_filename: file.name,
                        file_size: file.size,
                        mime_type: file.type
                    })
                    .select()
                    .single();

                if (dbError) throw dbError;

                uploadedImages.push(imageData);

                // 활동 로그
                await this.logActivity(projectId, 'image_uploaded', null, null, {
                    filename: file.name
                });
            }

            return uploadedImages;
        } catch (error) {
            console.error('이미지 업로드 오류:', error);
            throw error;
        }
    },

    async deleteImage(imageId, storagePath) {
        try {
            // Storage에서 삭제
            const { error: storageError } = await supabase.storage
                .from('project-images')
                .remove([storagePath]);

            if (storageError) throw storageError;

            // DB에서 삭제
            const { error: dbError } = await supabase
                .from('project_images')
                .delete()
                .eq('id', imageId);

            if (dbError) throw dbError;

            return { success: true };
        } catch (error) {
            console.error('이미지 삭제 오류:', error);
            throw error;
        }
    },

    async deleteProjectImages(projectId) {
        try {
            // 이미지 목록 조회
            const { data: images } = await supabase
                .from('project_images')
                .select('storage_path')
                .eq('project_id', projectId);

            if (images && images.length > 0) {
                const paths = images.map(img => img.storage_path);
                await supabase.storage
                    .from('project-images')
                    .remove(paths);
            }
        } catch (error) {
            console.error('프로젝트 이미지 삭제 오류:', error);
        }
    },

    async getProjectImages(projectId) {
        try {
            const { data, error } = await supabase
                .from('project_images')
                .select('*')
                .eq('project_id', projectId);

            if (error) throw error;

            // 서명된 URL 생성
            const imagesWithUrls = await Promise.all(
                data.map(async (img) => {
                    const url = await getAuthenticatedStorageUrl(img.storage_path);
                    return { ...img, url };
                })
            );

            return imagesWithUrls;
        } catch (error) {
            console.error('프로젝트 이미지 조회 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 학생 목록 (교사용)
    // ============================================

    async getStudents() {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, name, email, avatar_url')
                .eq('role', 'student')
                .order('name');

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('학생 목록 조회 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 실시간 구독 (Supabase Realtime)
    // ============================================

    subscribeToProjectChanges(userId, callback) {
        this.unsubscribe();

        this.realtimeSubscription = supabase
            .channel('project-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'projects',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    callback(payload.old, payload.new);
                }
            )
            .subscribe();
    },

    subscribeToPendingProjects(callback) {
        this.unsubscribe();

        this.realtimeSubscription = supabase
            .channel('pending-projects')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'projects',
                    filter: 'status=eq.pending'
                },
                (payload) => {
                    callback(payload.eventType, payload.new);
                }
            )
            .subscribe();
    },

    unsubscribe() {
        if (this.realtimeSubscription) {
            supabase.removeChannel(this.realtimeSubscription);
            this.realtimeSubscription = null;
        }
    },

    // ============================================
    // 검색 및 정렬
    // ============================================

    filterProjects(projects, searchTerm) {
        if (!searchTerm) return projects;
        const term = searchTerm.toLowerCase();
        return projects.filter(p =>
            p.title.toLowerCase().includes(term) ||
            p.prompt.toLowerCase().includes(term) ||
            (p.student_name && p.student_name.toLowerCase().includes(term))
        );
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
                const statusOrder = { pending: 0, approved: 1, rejected: 2, withdrawn: 3 };
                return sorted.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
            default:
                return sorted;
        }
    },

    // ============================================
    // UI 렌더링
    // ============================================

    renderEvaluationResult(evaluation) {
        const container = document.getElementById('evaluationResult');
        if (!container) return;

        const scores = evaluation.scores || {};
        const overallScore = scores.overall || 5;
        const isAppropriate = overallScore >= 6;

        // 22개정 교육과정 특화 점수 여부 확인
        const hasTemplateScores = scores.objectiveAlignment !== undefined;

        container.innerHTML = `
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${overallScore}/10</div>
                    <div class="score-label">종합 점수</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.creativity || 5}/10</div>
                    <div class="score-label">창의성</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.clarity || 5}/10</div>
                    <div class="score-label">명확성</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.mathRelevance || 5}/10</div>
                    <div class="score-label">수학 연관성</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.feasibility || 5}/10</div>
                    <div class="score-label">실현 가능성</div>
                </div>
            </div>

            ${hasTemplateScores ? `
                <div class="score-display" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.2);">
                    <p style="grid-column: 1 / -1; font-weight: 600; color: #4c1d95; margin-bottom: 10px;">22개정 교육과정 평가</p>
                    <div class="score-item">
                        <div class="score-value">${scores.objectiveAlignment || 5}/10</div>
                        <div class="score-label">학습목표 부합도</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value">${scores.achievementStandardFit || 5}/10</div>
                        <div class="score-label">성취기준 연계도</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value">${scores.guidelineCompliance || 5}/10</div>
                        <div class="score-label">기본지침 준수도</div>
                    </div>
                </div>
            ` : ''}

            ${evaluation.achievementLevelEstimate ? `
                <div style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 600;">예상 성취수준:</span>
                    <span class="achievement-badge level-${evaluation.achievementLevelEstimate}">${this.getAchievementLevelLabel(evaluation.achievementLevelEstimate)}</span>
                </div>
            ` : ''}

            <div class="feedback-text">
                <strong>AI 피드백:</strong><br>
                ${evaluation.feedback || '평가 완료'}
            </div>

            ${evaluation.suggestions && evaluation.suggestions.length > 0 ? `
                <div class="suggestions-list">
                    <strong>개선 제안:</strong>
                    <ul>
                        ${evaluation.suggestions.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            ${evaluation.gradeAppropriateness ? `
                <div style="margin-top: 15px; padding: 12px; backdrop-filter: blur(10px); background: ${evaluation.gradeAppropriateness.isAppropriate ? 'rgba(212, 237, 218, 0.3)' : 'rgba(255, 243, 205, 0.3)'}; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.3);">
                    <strong style="color: ${evaluation.gradeAppropriateness.isAppropriate ? '#155724' : '#856404'};">
                        ${evaluation.gradeAppropriateness.isAppropriate ? '✓ 학년 수준 적합' : '⚠ 학년 수준 점검 필요'}
                    </strong>
                    <p style="margin-top: 5px; font-size: 0.9rem; color: #333;">${evaluation.gradeAppropriateness.reason}</p>
                </div>
            ` : `
                <div style="margin-top: 15px; padding: 15px; backdrop-filter: blur(10px); background: ${isAppropriate ? 'rgba(212, 237, 218, 0.3)' : 'rgba(248, 215, 218, 0.3)'}; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.3); color: ${isAppropriate ? '#155724' : '#721c24'};">
                    <strong>${isAppropriate ? '✓ 적절한 프롬프트입니다' : '⚠ 프롬프트를 개선해보세요'}</strong>
                </div>
            `}

            ${evaluation.curriculumNotes ? `
                <div style="margin-top: 10px; padding: 10px; background: rgba(139, 92, 246, 0.1); border-radius: 8px; font-size: 0.85rem;">
                    <strong style="color: #4c1d95;">교육과정 연계:</strong>
                    <span style="color: #333;">${evaluation.curriculumNotes}</span>
                </div>
            ` : ''}
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    renderGeneratedContent(htmlContent) {
        const container = document.getElementById('generatedContent');
        if (!container) return;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        container.innerHTML = `
            <iframe src="${url}" style="width: 100%; height: 600px; border: none; border-radius: 8px;"></iframe>
            <div class="export-buttons" style="margin-top: 15px;">
                <button class="btn btn-secondary" onclick="ProjectManager.exportAsHTML()">
                    <i data-lucide="download" class="w-4 h-4"></i>
                    HTML 다운로드
                </button>
                <button class="btn btn-secondary" onclick="ProjectManager.exportAsPDF()">
                    <i data-lucide="file-text" class="w-4 h-4"></i>
                    PDF로 인쇄
                </button>
                <button class="btn btn-secondary" onclick="ProjectManager.openInNewTab()">
                    <i data-lucide="external-link" class="w-4 h-4"></i>
                    새 탭에서 열기
                </button>
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    // ============================================
    // 내보내기 기능
    // ============================================

    exportAsHTML() {
        if (!this.currentProject || !this.currentProject.html_content) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('내보낼 콘텐츠가 없습니다');
            }
            return;
        }

        const filename = `${this.currentProject.title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}.html`;
        if (typeof Exporter !== 'undefined') {
            Exporter.downloadHTML(this.currentProject.html_content, filename);
            Toast.success('HTML 파일이 다운로드되었습니다');
        }
    },

    exportAsPDF() {
        if (!this.currentProject || !this.currentProject.html_content) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('내보낼 콘텐츠가 없습니다');
            }
            return;
        }

        if (typeof Exporter !== 'undefined') {
            Exporter.downloadPDF(this.currentProject.html_content);
        }
    },

    openInNewTab() {
        if (!this.currentProject || !this.currentProject.html_content) {
            if (typeof Toast !== 'undefined') {
                Toast.warning('열 콘텐츠가 없습니다');
            }
            return;
        }

        const blob = new Blob([this.currentProject.html_content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    },

    // ============================================
    // 상태 배지 헬퍼
    // ============================================

    getStatusBadge(status) {
        const statusMap = {
            'pending': { text: '대기 중', class: 'pending' },
            'approved': { text: '승인됨', class: 'approved' },
            'rejected': { text: '거부됨', class: 'rejected' },
            'withdrawn': { text: '취소됨', class: 'withdrawn' },
            'feedback_requested': { text: '피드백 요청', class: 'feedback' }
        };
        const info = statusMap[status] || { text: status, class: '' };
        return `<span class="status-badge ${info.class}">${info.text}</span>`;
    },

    getStatusText(status) {
        const statusMap = {
            'pending': '승인 대기 중',
            'approved': '승인됨',
            'rejected': '거부됨',
            'withdrawn': '취소됨',
            'feedback_requested': '피드백 후 재제출 필요'
        };
        return statusMap[status] || status;
    },

    getActionText(action) {
        const actionMap = {
            'project_created': '프로젝트 생성',
            'project_submitted': '프롬프트 제출',
            'project_updated': '프로젝트 수정',
            'project_withdrawn': '제출 취소',
            'project_approved': '승인됨',
            'project_rejected': '거부됨',
            'project_resubmitted': '재제출',
            'project_improved': '프로젝트 개선',
            'feedback_requested': '피드백 요청됨',
            'content_generated': '콘텐츠 생성',
            'image_uploaded': '이미지 업로드',
            'version_created': '버전 생성',
            'template_created': '템플릿 생성',
            'template_updated': '템플릿 수정',
            'template_deleted': '템플릿 삭제'
        };
        return actionMap[action] || action;
    }
};
