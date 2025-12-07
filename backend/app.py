from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
from gemini_service import GeminiService
from prompt_evaluator import PromptEvaluator
from database import Database

# 환경 변수 로드
load_dotenv()

app = Flask(__name__)
# CORS 설정: 개발 환경 및 배포 환경 허용
CORS(app, origins=[
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:5500",
    "https://hotdeli88-pixel.github.io"
])

# 서비스 초기화
gemini_service = GeminiService()
prompt_evaluator = PromptEvaluator(gemini_service)
db = Database()

@app.route('/api/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({"status": "ok", "message": "Server is running"})

@app.route('/api/evaluate-prompt', methods=['POST'])
def evaluate_prompt():
    """프롬프트 적절성 평가"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        student_name = data.get('student_name', '')
        
        if not prompt:
            return jsonify({"error": "프롬프트가 필요합니다"}), 400
        
        # AI 평가 수행
        evaluation = prompt_evaluator.evaluate(prompt, student_name)
        
        return jsonify({
            "success": True,
            "evaluation": evaluation
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate-content', methods=['POST'])
def generate_content():
    """승인된 프롬프트로 HTML 콘텐츠 생성"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        student_name = data.get('student_name', '')
        
        if not prompt:
            return jsonify({"error": "프롬프트가 필요합니다"}), 400
        
        # Gemini API로 HTML 콘텐츠 생성
        html_content = gemini_service.generate_html_content(prompt, student_name)
        
        return jsonify({
            "success": True,
            "html_content": html_content
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects', methods=['POST'])
def create_project():
    """프로젝트 생성 (학생이 프롬프트 제출)"""
    try:
        data = request.get_json()
        student_name = data.get('student_name', '')
        title = data.get('title', '')
        prompt = data.get('prompt', '')
        evaluation = data.get('evaluation')
        
        if not student_name or not title or not prompt:
            return jsonify({"error": "학생 이름, 제목, 프롬프트가 필요합니다"}), 400
        
        # 데이터베이스에 프로젝트 저장
        project = db.create_project(student_name, title, prompt, evaluation)
        
        return jsonify({
            "success": True,
            "project": project
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects/pending', methods=['GET'])
def get_pending_projects():
    """승인 대기 중인 프로젝트 조회"""
    try:
        projects = db.get_pending_projects()
        return jsonify({
            "success": True,
            "projects": projects
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects', methods=['GET'])
def get_projects():
    """프로젝트 조회 (학생별 필터링 가능)"""
    try:
        student_name = request.args.get('student_name')
        projects = db.get_all_projects(student_name)
        return jsonify({
            "success": True,
            "projects": projects
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    """특정 프로젝트 조회"""
    try:
        project = db.get_project(project_id)
        if not project:
            return jsonify({"error": "프로젝트를 찾을 수 없습니다"}), 404
        return jsonify({
            "success": True,
            "project": project
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects/<int:project_id>/approve', methods=['PUT'])
def approve_project(project_id):
    """프로젝트 승인"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        student_name = data.get('student_name', '')
        
        # 프로젝트 조회
        project = db.get_project(project_id)
        if not project:
            return jsonify({"error": "프로젝트를 찾을 수 없습니다"}), 404
        
        # 콘텐츠 생성
        html_content = gemini_service.generate_html_content(prompt or project['prompt'], student_name or project['student_name'])
        
        # 프로젝트 승인 및 콘텐츠 저장
        updated_project = db.approve_project(project_id, html_content)
        
        # 버전 히스토리 저장
        db.create_version(
            project_id,
            project['prompt'],
            html_content,
            project.get('evaluation'),
            'approved'
        )
        
        return jsonify({
            "success": True,
            "project": updated_project
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects/<int:project_id>/reject', methods=['PUT'])
def reject_project(project_id):
    """프로젝트 거부"""
    try:
        data = request.get_json()
        rejection_reason = data.get('rejection_reason', '')
        
        # 프로젝트 조회
        project = db.get_project(project_id)
        if not project:
            return jsonify({"error": "프로젝트를 찾을 수 없습니다"}), 404
        
        # 프로젝트 거부
        updated_project = db.reject_project(project_id, rejection_reason)
        
        return jsonify({
            "success": True,
            "project": updated_project
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects/<int:project_id>/versions', methods=['GET'])
def get_project_versions(project_id):
    """프로젝트의 버전 히스토리 조회"""
    try:
        versions = db.get_versions_by_project(project_id)
        return jsonify({
            "success": True,
            "versions": versions
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    """프로젝트 업데이트"""
    try:
        data = request.get_json()

        # 프로젝트 조회
        project = db.get_project(project_id)
        if not project:
            return jsonify({"error": "프로젝트를 찾을 수 없습니다"}), 404

        # 업데이트할 필드만 추출
        updates = {}
        allowed_fields = ['title', 'prompt', 'evaluation', 'status', 'html_content']
        for field in allowed_fields:
            if field in data:
                updates[field] = data[field]

        # 버전 히스토리 저장 (프롬프트나 평가가 변경된 경우)
        if 'prompt' in updates or 'evaluation' in updates:
            db.create_version(
                project_id,
                updates.get('prompt', project['prompt']),
                updates.get('html_content', project.get('html_content')),
                updates.get('evaluation', project.get('evaluation')),
                updates.get('status', project['status'])
            )

        updated_project = db.update_project(project_id, **updates)

        return jsonify({
            "success": True,
            "project": updated_project
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """프로젝트 삭제"""
    try:
        # 프로젝트 조회
        project = db.get_project(project_id)
        if not project:
            return jsonify({"error": "프로젝트를 찾을 수 없습니다"}), 404

        # 프로젝트 삭제
        db.delete_project(project_id)

        return jsonify({
            "success": True,
            "message": "프로젝트가 삭제되었습니다"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/students', methods=['GET'])
def get_students():
    """모든 학생 목록 조회"""
    try:
        students = db.get_all_students()
        return jsonify({
            "success": True,
            "students": students
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, port=port, host='0.0.0.0')

