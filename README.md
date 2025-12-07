# AIEDAP - 수학 콘텐츠 생성 시스템

수학 수업 후 학생들이 배운 내용을 바탕으로 프롬프트를 작성하고, AI가 평가한 후 교사가 승인하면 Gemini API를 통해 HTML 기반 콘텐츠를 생성하는 교육용 시스템입니다.

## 주요 기능

1. **프롬프트 제출 및 평가**
   - 학생이 프롬프트 입력
   - AI(Gemini)가 1차 적절성 평가 및 피드백 제공
   - 교사가 최종 승인/거부 결정

2. **콘텐츠 생성**
   - 승인된 프롬프트로 Gemini API 호출
   - HTML 기반 인터랙티브 콘텐츠 생성
   - 생성된 콘텐츠를 학생 프로젝트에 저장

3. **프로젝트 관리**
   - 학생별 프로젝트 분류 및 저장
   - 프로젝트 개선 히스토리 누적 기록
   - 버전별 변경사항 추적

4. **평가 시스템**
   - 학생별 수행 과정 기록
   - 프로젝트 진화 과정 시각화
   - 평가용 리포트 생성

## 기술 스택

- **백엔드**: Python Flask
- **프론트엔드**: 순수 HTML/CSS/JavaScript
- **데이터베이스**: IndexedDB (브라우저 로컬 저장소)
- **AI API**: Google Gemini 3 Pro Preview

## 설치 및 실행

### 빠른 시작 (권장)

**Windows 사용자:**
1. `start.bat` 파일을 더블클릭하면 백엔드와 프론트엔드가 자동으로 시작됩니다.
2. 브라우저에서 `http://localhost:8000`을 열어주세요.

**수동 실행:**
- 백엔드만 실행: `start-backend.bat` 실행
- 프론트엔드만 실행: `start-frontend.bat` 실행

### 상세 설치 방법

#### 1. 백엔드 설정

```bash
cd backend
pip install -r requirements.txt
```

또는 가상 환경 사용:
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

#### 2. 환경 변수 설정

`backend` 폴더에 `.env` 파일을 생성하고 Gemini API 키를 입력하세요:

```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=5000
```

`.env.example` 파일을 참고하세요.

#### 3. 백엔드 서버 실행

```bash
cd backend
python app.py
```

서버가 `http://localhost:5000`에서 실행됩니다.

#### 4. 프론트엔드 실행

프론트엔드는 정적 파일이므로 웹 서버를 통해 실행해야 합니다.

**방법 1: Python HTTP 서버 (권장)**
```bash
cd frontend
python -m http.server 8000
```
그 후 브라우저에서 `http://localhost:8000` 접속

**방법 2: VS Code Live Server 확장 사용**
- VS Code에서 `frontend` 폴더를 열고
- `index.html`을 우클릭하여 "Open with Live Server" 선택

**방법 3: 직접 파일 열기 (비권장)**
- `frontend/index.html` 파일을 브라우저에서 직접 열기
- (CORS 이슈가 있을 수 있음)

## 사용 방법

### 학생 인터페이스

1. 메인 페이지에서 이름 입력 후 "학생" 역할 선택
2. "새 프로젝트 만들기" 클릭
3. 프로젝트 제목과 프롬프트 입력
4. "제출하기" 클릭하여 AI 평가 받기
5. 교사 승인 후 생성된 콘텐츠 확인
6. "개선하기" 버튼으로 프로젝트 개선 가능
7. "히스토리 보기"로 프로젝트 진화 과정 확인

### 교사 인터페이스

1. 메인 페이지에서 이름 입력 후 "교사" 역할 선택
2. "승인 대기 중인 프롬프트" 목록에서 학생 프롬프트 확인
3. AI 평가 결과를 참고하여 승인/거부 결정
4. 승인 시 자동으로 콘텐츠 생성
5. "학생별 프로젝트"에서 전체 프로젝트 조회
6. "리포트 생성"으로 학생별 평가 리포트 확인

## 프로젝트 구조

```
AIEDAP/
├── backend/
│   ├── app.py                 # Flask 서버 메인
│   ├── gemini_service.py      # Gemini API 연동
│   ├── prompt_evaluator.py    # 프롬프트 평가 로직
│   └── requirements.txt       # Python 의존성
├── frontend/
│   ├── index.html             # 메인 페이지
│   ├── student.html           # 학생 인터페이스
│   ├── teacher.html           # 교사 인터페이스
│   ├── css/
│   │   └── style.css          # 스타일시트
│   ├── js/
│   │   ├── auth.js            # 인증 관리
│   │   ├── student.js         # 학생 기능
│   │   ├── teacher.js         # 교사 기능
│   │   ├── projectManager.js  # 프로젝트 관리
│   │   └── db.js              # IndexedDB 관리
│   └── assets/                # 생성된 콘텐츠 저장
├── .env.example               # 환경 변수 예시
└── README.md                  # 프로젝트 설명
```

## API 엔드포인트

### `GET /api/health`
서버 상태 확인

### `POST /api/evaluate-prompt`
프롬프트 적절성 평가
- Request Body:
  ```json
  {
    "prompt": "프롬프트 내용",
    "student_name": "학생 이름"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "evaluation": {
      "overall_score": 4,
      "scores": {
        "relevance": 4,
        "clarity": 5,
        "educational_value": 4,
        "feasibility": 3
      },
      "feedback": "피드백 메시지",
      "suggestions": ["제안 1", "제안 2"],
      "is_appropriate": true
    }
  }
  ```

### `POST /api/generate-content`
HTML 콘텐츠 생성
- Request Body:
  ```json
  {
    "prompt": "프롬프트 내용",
    "student_name": "학생 이름"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "html_content": "<html>...</html>"
  }
  ```

## 주의사항

1. **CORS 설정**: 백엔드에서 프론트엔드 도메인을 허용하도록 설정되어 있습니다. 다른 포트나 도메인을 사용하는 경우 `backend/app.py`의 CORS 설정을 수정하세요.

2. **API 키 보안**: Gemini API 키는 반드시 `.env` 파일에 저장하고, `.env` 파일을 Git에 커밋하지 마세요.

3. **브라우저 호환성**: IndexedDB를 사용하므로 최신 브라우저가 필요합니다.

## 라이선스

이 프로젝트는 교육 목적으로 제작되었습니다.

