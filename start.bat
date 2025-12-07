@echo off
chcp 65001 >nul
echo ========================================
echo AIEDAP 수학 콘텐츠 생성 시스템 시작
echo ========================================
echo.

REM 현재 디렉토리 확인
cd /d "%~dp0"

REM Python 설치 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo Python을 설치한 후 다시 시도해주세요.
    pause
    exit /b 1
)

echo [1/3] Python 의존성 확인 중...
cd backend
if not exist "venv" (
    echo 가상 환경 생성 중...
    python -m venv venv
)

echo 가상 환경 활성화 중...
call venv\Scripts\activate.bat

echo 패키지 설치 확인 중...
pip install -q -r requirements.txt
if errorlevel 1 (
    echo [오류] 패키지 설치에 실패했습니다.
    pause
    exit /b 1
)

REM .env 파일 확인
cd ..
if not exist "backend\.env" (
    if exist ".env.example" (
        echo [알림] .env 파일이 없습니다. .env.example을 복사합니다.
        copy .env.example backend\.env >nul
        echo [중요] backend\.env 파일을 열어서 GEMINI_API_KEY를 입력해주세요!
        timeout /t 3 >nul
    ) else (
        echo [경고] .env 파일이 없습니다. backend\.env 파일을 생성하고 GEMINI_API_KEY를 설정해주세요.
    )
)

echo.
echo [2/3] 백엔드 서버 시작 중...
cd backend
start "AIEDAP 백엔드 서버" cmd /k "venv\Scripts\activate.bat && python app.py"
timeout /t 3 >nul

echo.
echo [3/3] 프론트엔드 서버 시작 중...
cd ..\frontend
start "AIEDAP 프론트엔드 서버" cmd /k "python -m http.server 8000"

echo.
echo ========================================
echo 서버가 시작되었습니다!
echo ========================================
echo.
echo 백엔드 서버: http://localhost:5000
echo 프론트엔드: http://localhost:8000
echo.
echo 브라우저에서 http://localhost:8000 을 열어주세요.
echo.
echo 서버를 종료하려면 각 창을 닫으시면 됩니다.
echo ========================================
echo.
pause

