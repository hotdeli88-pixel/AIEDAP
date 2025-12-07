@echo off
chcp 65001 >nul
echo ========================================
echo AIEDAP 프론트엔드 서버 시작
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

cd frontend

echo 프론트엔드 서버 시작 중...
echo 서버 주소: http://localhost:8000
echo.
echo 브라우저에서 http://localhost:8000 을 열어주세요.
echo.
echo 종료하려면 Ctrl+C를 누르거나 창을 닫으세요.
echo ========================================
echo.

python -m http.server 8000

pause

