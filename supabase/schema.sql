-- AIEDAP Supabase Database Schema
-- 중학교 수학 2022 개정 교육과정 기반 프로젝트 관리 시스템
-- Supabase Dashboard > SQL Editor에서 실행하세요

-- =====================================================
-- 1. USERS 테이블 (Supabase Auth와 연동)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
    grade INTEGER CHECK (grade IS NULL OR grade IN (1, 2, 3)), -- 중학교 학년 (학생용)
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 테이블에 grade 컬럼 추가 (마이그레이션용)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'grade') THEN
        ALTER TABLE users ADD COLUMN grade INTEGER CHECK (grade IS NULL OR grade IN (1, 2, 3));
    END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade);

-- =====================================================
-- 2. PROJECT_TEMPLATES 테이블 (교사가 생성하는 프로젝트 템플릿)
-- 중학교 수학 22개정 성취기준 기반
-- =====================================================
CREATE TABLE IF NOT EXISTS project_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,                    -- 템플릿 이름 (예: "일차함수 그래프 탐구")
    grade INTEGER NOT NULL CHECK (grade IN (1, 2, 3)),  -- 중학교 학년 (1, 2, 3)
    math_domain TEXT NOT NULL CHECK (math_domain IN (
        'number_operation',  -- 수와 연산
        'algebra',           -- 문자와 식
        'function',          -- 함수
        'geometry',          -- 기하
        'statistics'         -- 확률과 통계
    )),
    unit_name TEXT,                         -- 단원명 (예: "일차함수와 그래프")
    achievement_standard_code TEXT,         -- 성취기준 코드 (예: "[9수04-01]")
    achievement_standard TEXT NOT NULL,     -- 성취기준 내용
    learning_objectives JSONB NOT NULL DEFAULT '[]',  -- 학습목표 배열 [{order: 1, content: "..."}]
    expected_level TEXT DEFAULT 'B' CHECK (expected_level IN ('A', 'B', 'C', 'D', 'E')),
    guidelines TEXT NOT NULL,               -- 교사 기본지침 (AI 피드백용)
    ai_restrictions TEXT,                   -- AI 피드백 제한사항
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_templates_teacher_id ON project_templates(teacher_id);
CREATE INDEX IF NOT EXISTS idx_templates_grade ON project_templates(grade);
CREATE INDEX IF NOT EXISTS idx_templates_math_domain ON project_templates(math_domain);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON project_templates(is_active);

-- =====================================================
-- 3. PROJECTS 테이블
-- =====================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID REFERENCES project_templates(id) ON DELETE SET NULL,  -- 연결된 템플릿
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    evaluation JSONB,
    html_content TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn', 'feedback_requested')),
    rejection_reason TEXT,
    teacher_feedback TEXT,              -- 교사 피드백 내용
    feedback_requested_at TIMESTAMPTZ,  -- 피드백 요청 시간
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 테이블에 새 컬럼 추가 (마이그레이션용)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'projects' AND column_name = 'template_id') THEN
        ALTER TABLE projects ADD COLUMN template_id UUID REFERENCES project_templates(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'projects' AND column_name = 'teacher_feedback') THEN
        ALTER TABLE projects ADD COLUMN teacher_feedback TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'projects' AND column_name = 'feedback_requested_at') THEN
        ALTER TABLE projects ADD COLUMN feedback_requested_at TIMESTAMPTZ;
    END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_template_id ON projects(template_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- =====================================================
-- 3. PROJECT_IMAGES 테이블 (이미지 첨부)
-- =====================================================
CREATE TABLE IF NOT EXISTS project_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_project_images_project_id ON project_images(project_id);

-- =====================================================
-- 5. VERSIONS 테이블 (버전 히스토리)
-- =====================================================
CREATE TABLE IF NOT EXISTS versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    prompt TEXT NOT NULL,
    html_content TEXT,
    evaluation JSONB,
    status TEXT NOT NULL,
    improvement_reason TEXT,        -- 개선 이유 (학생이 작성)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 테이블에 improvement_reason 컬럼 추가 (마이그레이션용)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'versions' AND column_name = 'improvement_reason') THEN
        ALTER TABLE versions ADD COLUMN improvement_reason TEXT;
    END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_versions_project_id ON versions(project_id);
CREATE INDEX IF NOT EXISTS idx_versions_created_at ON versions(created_at DESC);

-- 버전 번호 자동 증가 함수
CREATE OR REPLACE FUNCTION set_version_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version_number := COALESCE(
        (SELECT MAX(version_number) + 1 FROM versions WHERE project_id = NEW.project_id),
        1
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거
DROP TRIGGER IF EXISTS trigger_set_version_number ON versions;
CREATE TRIGGER trigger_set_version_number
    BEFORE INSERT ON versions
    FOR EACH ROW
    EXECUTE FUNCTION set_version_number();

-- =====================================================
-- 6. ACTIVITY_LOGS 테이블 (이벤트 로깅)
-- =====================================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN (
        'project_created',
        'project_submitted',
        'project_updated',
        'project_withdrawn',
        'project_approved',
        'project_rejected',
        'project_resubmitted',
        'project_improved',
        'feedback_requested',       -- 교사가 피드백 요청
        'content_generated',
        'image_uploaded',
        'version_created',
        'template_created',         -- 템플릿 생성
        'template_updated',         -- 템플릿 수정
        'template_deleted'          -- 템플릿 삭제
    )),
    details JSONB,
    old_status TEXT,
    new_status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_activity_logs_project_id ON activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- =====================================================
-- 6. updated_at 자동 업데이트 함수
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- users 테이블 트리거
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- projects 테이블 트리거
DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. 프로젝트 상태 변경 시 자동 로깅
-- =====================================================
CREATE OR REPLACE FUNCTION log_project_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO activity_logs (project_id, user_id, action, old_status, new_status, details)
        VALUES (
            NEW.id,
            NEW.user_id,
            CASE
                WHEN NEW.status = 'approved' THEN 'project_approved'
                WHEN NEW.status = 'rejected' THEN 'project_rejected'
                WHEN NEW.status = 'withdrawn' THEN 'project_withdrawn'
                WHEN NEW.status = 'feedback_requested' THEN 'feedback_requested'
                WHEN OLD.status IN ('rejected', 'withdrawn', 'feedback_requested') AND NEW.status = 'pending' THEN 'project_resubmitted'
                WHEN OLD.status = 'approved' AND NEW.status = 'pending' THEN 'project_improved'
                ELSE 'project_updated'
            END,
            OLD.status,
            NEW.status,
            jsonb_build_object(
                'rejection_reason', NEW.rejection_reason,
                'teacher_feedback', NEW.teacher_feedback,
                'title', NEW.title
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_project_status ON projects;
CREATE TRIGGER trigger_log_project_status
    AFTER UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION log_project_status_change();

-- project_templates 테이블 updated_at 트리거
DROP TRIGGER IF EXISTS trigger_templates_updated_at ON project_templates;
CREATE TRIGGER trigger_templates_updated_at
    BEFORE UPDATE ON project_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. Row Level Security (RLS) 활성화
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_images ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 9. RLS 정책 - USERS
-- =====================================================
-- 자신의 프로필 조회
CREATE POLICY "Users can view their own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

-- 자신의 프로필 수정
CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- 자신의 프로필 삽입
CREATE POLICY "Users can insert their own profile"
    ON users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 교사는 모든 사용자 조회 가능
CREATE POLICY "Teachers can view all users"
    ON users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- =====================================================
-- 10. RLS 정책 - PROJECTS
-- =====================================================
-- 학생: 자신의 프로젝트 조회
CREATE POLICY "Students can view their own projects"
    ON projects FOR SELECT
    USING (user_id = auth.uid());

-- 학생: 자신의 프로젝트 생성
CREATE POLICY "Students can create their own projects"
    ON projects FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 학생: 자신의 프로젝트 수정
CREATE POLICY "Students can update their own projects"
    ON projects FOR UPDATE
    USING (user_id = auth.uid());

-- 학생: 자신의 프로젝트 삭제
CREATE POLICY "Students can delete their own projects"
    ON projects FOR DELETE
    USING (user_id = auth.uid());

-- 교사: 모든 프로젝트 조회
CREATE POLICY "Teachers can view all projects"
    ON projects FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- 교사: 모든 프로젝트 상태 변경
CREATE POLICY "Teachers can update all projects"
    ON projects FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- =====================================================
-- 10-1. RLS 정책 - PROJECT_TEMPLATES
-- =====================================================
-- 모든 사용자가 활성화된 템플릿 조회 가능
CREATE POLICY "All users can view active templates"
    ON project_templates FOR SELECT
    USING (is_active = true);

-- 교사: 자신의 템플릿 생성
CREATE POLICY "Teachers can create templates"
    ON project_templates FOR INSERT
    WITH CHECK (
        teacher_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- 교사: 자신의 템플릿 수정
CREATE POLICY "Teachers can update their templates"
    ON project_templates FOR UPDATE
    USING (
        teacher_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- 교사: 자신의 템플릿 삭제
CREATE POLICY "Teachers can delete their templates"
    ON project_templates FOR DELETE
    USING (
        teacher_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- 교사: 모든 템플릿 조회 (비활성 포함)
CREATE POLICY "Teachers can view all templates"
    ON project_templates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- =====================================================
-- 11. RLS 정책 - VERSIONS
-- =====================================================
-- 자신의 프로젝트 버전 조회
CREATE POLICY "Users can view versions of their projects"
    ON versions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = versions.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- 자신의 프로젝트 버전 생성
CREATE POLICY "Users can create versions for their projects"
    ON versions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = versions.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- 교사: 모든 버전 조회
CREATE POLICY "Teachers can view all versions"
    ON versions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- 교사: 모든 버전 생성 (승인 시)
CREATE POLICY "Teachers can create versions"
    ON versions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- =====================================================
-- 12. RLS 정책 - ACTIVITY_LOGS
-- =====================================================
-- 자신의 활동 로그 조회
CREATE POLICY "Users can view their activity logs"
    ON activity_logs FOR SELECT
    USING (user_id = auth.uid());

-- 자신의 활동 로그 생성
CREATE POLICY "Users can create their activity logs"
    ON activity_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 교사: 모든 활동 로그 조회
CREATE POLICY "Teachers can view all activity logs"
    ON activity_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- =====================================================
-- 13. RLS 정책 - PROJECT_IMAGES
-- =====================================================
-- 자신의 프로젝트 이미지 관리
CREATE POLICY "Users can manage images of their projects"
    ON project_images FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_images.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- 교사: 모든 이미지 조회
CREATE POLICY "Teachers can view all images"
    ON project_images FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
        )
    );

-- =====================================================
-- 14. Storage 버킷 설정 (Dashboard에서 수동 설정 필요)
-- =====================================================
-- 1. Storage > New Bucket > "project-images" 생성 (Public: false)
-- 2. 아래 정책들을 Storage > Policies에서 추가

-- Storage 정책 (SQL로는 직접 생성 불가, Dashboard에서 설정):
-- INSERT: bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text
-- SELECT: bucket_id = 'project-images' AND (auth.uid()::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'))
-- DELETE: bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text

-- =====================================================
-- 15. 신규 사용자 생성 시 users 테이블에 자동 추가
-- =====================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role, grade, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
        (NEW.raw_user_meta_data->>'grade')::INTEGER,  -- 중학교 학년 (1, 2, 3)
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- auth.users에 트리거 설정
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
