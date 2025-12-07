@echo off
chcp 65001 >nul
echo ========================================
echo AIEDAP 백엔드 서버 시작
echo ========================================
echo.

REM 현재 디렉토리 확인
cd /d "%~dp0"

REM Python 설치 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    pause
    exit /b 1
)

cd backend

REM 가상 환경 확인 및 생성
if not exist "venv" (
    echo 가상 환경 생성 중...
    python -m venv venv
)

REM 가상 환경 활성화
call venv\Scripts\activate.bat

REM 패키지 설치
echo 패키지 설치 확인 중...
pip install -q -r requirements.txt

REM .env 파일 확인
if not exist ".env" (
    if exist "..\.env.example" (
        copy ..\.env.example .env >nul
        echo [중요] .env 파일을 열어서 GEMINI_API_KEY를 입력해주세요!
    )
)

echo.
echo 백엔드 서버 시작 중...
echo 서버 주소: http://localhost:5000
echo.
echo 종료하려면 Ctrl+C를 누르거나 창을 닫으세요.
echo ========================================
echo.

python app.py

pause

