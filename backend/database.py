import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager

class Database:
    def __init__(self, db_path='aiedap.db'):
        self.db_path = db_path
        self.init_db()

    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_db(self):
        """데이터베이스 초기화 및 테이블 생성"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # 프로젝트 테이블
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_name TEXT NOT NULL,
                    title TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    evaluation TEXT,
                    html_content TEXT,
                    status TEXT DEFAULT 'pending',
                    rejection_reason TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 버전 히스토리 테이블
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    prompt TEXT NOT NULL,
                    html_content TEXT,
                    evaluation TEXT,
                    status TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id)
                )
            ''')
            
            # 인덱스 생성
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_student_name ON projects(student_name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_status ON projects(status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_project_id ON versions(project_id)')

    def create_project(self, student_name, title, prompt, evaluation=None):
        """프로젝트 생성"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            evaluation_json = json.dumps(evaluation, ensure_ascii=False) if evaluation else None
            
            cursor.execute('''
                INSERT INTO projects (student_name, title, prompt, evaluation, status)
                VALUES (?, ?, ?, ?, ?)
            ''', (student_name, title, prompt, evaluation_json, 'pending'))
            
            project_id = cursor.lastrowid
            return self.get_project(project_id)

    def get_project(self, project_id):
        """프로젝트 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM projects WHERE id = ?', (project_id,))
            row = cursor.fetchone()
            return self._row_to_dict(row) if row else None

    def get_pending_projects(self):
        """승인 대기 중인 프로젝트 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM projects 
                WHERE status = 'pending' 
                ORDER BY created_at DESC
            ''')
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]

    def get_all_projects(self, student_name=None):
        """모든 프로젝트 조회 (선택적으로 학생별 필터링)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if student_name:
                cursor.execute('''
                    SELECT * FROM projects 
                    WHERE student_name = ? 
                    ORDER BY created_at DESC
                ''', (student_name,))
            else:
                cursor.execute('''
                    SELECT * FROM projects 
                    ORDER BY created_at DESC
                ''')
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]

    def update_project(self, project_id, **updates):
        """프로젝트 업데이트"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # 업데이트할 필드 구성
            set_clauses = []
            values = []
            
            for key, value in updates.items():
                if key == 'evaluation' and isinstance(value, dict):
                    set_clauses.append(f'{key} = ?')
                    values.append(json.dumps(value, ensure_ascii=False))
                else:
                    set_clauses.append(f'{key} = ?')
                    values.append(value)
            
            set_clauses.append('updated_at = CURRENT_TIMESTAMP')
            values.append(project_id)
            
            cursor.execute(f'''
                UPDATE projects 
                SET {', '.join(set_clauses)}
                WHERE id = ?
            ''', values)
            
            return self.get_project(project_id)

    def approve_project(self, project_id, html_content=None):
        """프로젝트 승인"""
        updates = {'status': 'approved'}
        if html_content:
            updates['html_content'] = html_content
        return self.update_project(project_id, **updates)

    def reject_project(self, project_id, rejection_reason=None):
        """프로젝트 거부"""
        updates = {'status': 'rejected'}
        if rejection_reason:
            updates['rejection_reason'] = rejection_reason
        return self.update_project(project_id, **updates)

    def create_version(self, project_id, prompt, html_content=None, evaluation=None, status=None):
        """버전 히스토리 생성"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            evaluation_json = json.dumps(evaluation, ensure_ascii=False) if evaluation else None
            
            cursor.execute('''
                INSERT INTO versions (project_id, prompt, html_content, evaluation, status)
                VALUES (?, ?, ?, ?, ?)
            ''', (project_id, prompt, html_content, evaluation_json, status))
            
            version_id = cursor.lastrowid
            return self.get_version(version_id)

    def get_version(self, version_id):
        """버전 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM versions WHERE id = ?', (version_id,))
            row = cursor.fetchone()
            return self._row_to_dict(row) if row else None

    def get_versions_by_project(self, project_id):
        """프로젝트의 버전 히스토리 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM versions 
                WHERE project_id = ? 
                ORDER BY created_at DESC
            ''', (project_id,))
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]

    def delete_project(self, project_id):
        """프로젝트 및 관련 버전 삭제"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            # 관련 버전 먼저 삭제
            cursor.execute('DELETE FROM versions WHERE project_id = ?', (project_id,))
            # 프로젝트 삭제
            cursor.execute('DELETE FROM projects WHERE id = ?', (project_id,))
            return True

    def get_all_students(self):
        """모든 학생 이름 조회 (중복 제거)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT DISTINCT student_name
                FROM projects
                ORDER BY student_name
            ''')
            rows = cursor.fetchall()
            return [row['student_name'] for row in rows]

    def _row_to_dict(self, row):
        """Row 객체를 딕셔너리로 변환"""
        if not row:
            return None

        result = dict(row)

        # JSON 필드 파싱
        if result.get('evaluation'):
            try:
                result['evaluation'] = json.loads(result['evaluation'])
            except:
                pass

        # 날짜 문자열 변환
        if result.get('created_at'):
            result['createdAt'] = result['created_at']
        if result.get('updated_at'):
            result['updatedAt'] = result['updated_at']

        return result

