// 프로젝트 관리 모듈
const ProjectManager = {
    currentProject: null,
    apiBaseUrl: 'http://localhost:5000/api',
    pollingInterval: null,
    lastPendingCount: 0,

    // ============================================
    // API 호출 메서드
    // ============================================

    async evaluatePrompt(prompt, studentName) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/evaluate-prompt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    student_name: studentName
                })
            });

            if (!response.ok) {
                throw new Error('평가 요청 실패');
            }

            const data = await response.json();
            return data.evaluation;
        } catch (error) {
            console.error('프롬프트 평가 오류:', error);
            throw error;
        }
    },

    async generateContent(prompt, studentName) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/generate-content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    student_name: studentName
                })
            });

            if (!response.ok) {
                throw new Error('콘텐츠 생성 실패');
            }

            const data = await response.json();
            return data.html_content;
        } catch (error) {
            console.error('콘텐츠 생성 오류:', error);
            throw error;
        }
    },

    async createProject(projectData) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/projects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(projectData)
            });

            if (!response.ok) {
                throw new Error('프로젝트 생성 실패');
            }

            const data = await response.json();
            return data.project;
        } catch (error) {
            console.error('프로젝트 생성 오류:', error);
            throw error;
        }
    },

    async updateProject(projectId, updates) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/projects/${projectId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                throw new Error('프로젝트 업데이트 실패');
            }

            const data = await response.json();
            return data.project;
        } catch (error) {
            console.error('프로젝트 업데이트 오류:', error);
            throw error;
        }
    },

    async deleteProject(projectId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/projects/${projectId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('프로젝트 삭제 실패');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('프로젝트 삭제 오류:', error);
            throw error;
        }
    },

    async getProject(projectId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/projects/${projectId}`);
            if (!response.ok) {
                throw new Error('프로젝트 조회 실패');
            }
            const data = await response.json();
            return data.project;
        } catch (error) {
            console.error('프로젝트 조회 오류:', error);
            throw error;
        }
    },

    async getProjects(studentName = null) {
        try {
            const url = studentName
                ? `${this.apiBaseUrl}/projects?student_name=${encodeURIComponent(studentName)}`
                : `${this.apiBaseUrl}/projects`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('프로젝트 목록 조회 실패');
            }
            const data = await response.json();
            return data.projects;
        } catch (error) {
            console.error('프로젝트 목록 조회 오류:', error);
            throw error;
        }
    },

    async getPendingProjects() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/projects/pending`);
            if (!response.ok) {
                throw new Error('승인 대기 프로젝트 조회 실패');
            }
            const data = await response.json();
            return data.projects;
        } catch (error) {
            console.error('승인 대기 프로젝트 조회 오류:', error);
            throw error;
        }
    },

    async approveProject(projectId, prompt, studentName) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/projects/${projectId}/approve`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    student_name: studentName
                })
            });

            if (!response.ok) {
                throw new Error('프로젝트 승인 실패');
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
            const response = await fetch(`${this.apiBaseUrl}/projects/${projectId}/reject`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rejection_reason: rejectionReason
                })
            });

            if (!response.ok) {
                throw new Error('프로젝트 거부 실패');
            }

            const data = await response.json();
            return data.project;
        } catch (error) {
            console.error('프로젝트 거부 오류:', error);
            throw error;
        }
    },

    async getVersions(projectId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/projects/${projectId}/versions`);
            if (!response.ok) {
                throw new Error('버전 히스토리 조회 실패');
            }
            const data = await response.json();
            return data.versions;
        } catch (error) {
            console.error('버전 히스토리 조회 오류:', error);
            throw error;
        }
    },

    async getStudents() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/students`);
            if (!response.ok) {
                throw new Error('학생 목록 조회 실패');
            }
            const data = await response.json();
            return data.students;
        } catch (error) {
            console.error('학생 목록 조회 오류:', error);
            throw error;
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
                return sorted.sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
            case 'oldest':
                return sorted.sort((a, b) => new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt));
            case 'title':
                return sorted.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
            case 'status':
                const statusOrder = { pending: 0, approved: 1, rejected: 2 };
                return sorted.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
            default:
                return sorted;
        }
    },

    // ============================================
    // 실시간 업데이트 (폴링)
    // ============================================

    startPolling(callback, interval = 10000) {
        this.stopPolling();
        this.pollingInterval = setInterval(async () => {
            try {
                await callback();
            } catch (error) {
                console.error('폴링 오류:', error);
            }
        }, interval);
    },

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    },

    // ============================================
    // UI 렌더링
    // ============================================

    renderEvaluationResult(evaluation) {
        const container = document.getElementById('evaluationResult');
        if (!container) return;

        const isAppropriate = evaluation.is_appropriate;
        const overallScore = evaluation.overall_score || 3;

        container.innerHTML = `
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${overallScore}/5</div>
                    <div class="score-label">종합 점수</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${evaluation.scores?.relevance || 3}/5</div>
                    <div class="score-label">연관성</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${evaluation.scores?.clarity || 3}/5</div>
                    <div class="score-label">명확성</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${evaluation.scores?.educational_value || 3}/5</div>
                    <div class="score-label">교육적 가치</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${evaluation.scores?.feasibility || 3}/5</div>
                    <div class="score-label">실현 가능성</div>
                </div>
            </div>
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
            <div style="margin-top: 15px; padding: 15px; backdrop-filter: blur(10px); background: ${isAppropriate ? 'rgba(212, 237, 218, 0.3)' : 'rgba(248, 215, 218, 0.3)'}; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.3); color: ${isAppropriate ? '#155724' : '#721c24'};">
                <strong>${isAppropriate ? '✓ 적절한 프롬프트입니다' : '⚠ 프롬프트를 개선해보세요'}</strong>
            </div>
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
            'rejected': { text: '거부됨', class: 'rejected' }
        };
        const info = statusMap[status] || { text: status, class: '' };
        return `<span class="status-badge ${info.class}">${info.text}</span>`;
    },

    getStatusText(status) {
        const statusMap = {
            'pending': '승인 대기 중',
            'approved': '승인됨',
            'rejected': '거부됨',
            'completed': '완료됨'
        };
        return statusMap[status] || status;
    }
};
