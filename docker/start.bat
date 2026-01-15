@echo off
REM StockViewer Docker Start Script for Windows
REM One-click build and run

echo ================================================
echo   StockViewer - Docker One-Click Build
echo ================================================
echo.

REM Check if Docker is available
docker --version >nul 2>&1
if errorlevel 1 (
    echo Error: Docker is not installed.
    echo Please install Docker from https://www.docker.com/get-started
    pause
    exit /b 1
)

REM Check if Docker Compose is available
docker compose version >nul 2>&1
if errorlevel 1 (
    echo Error: Docker Compose is not available.
    echo Please ensure Docker Desktop is installed and running.
    pause
    exit /b 1
)

echo Building Docker images...
echo This may take several minutes on first run.
echo.

REM Build and start containers
docker compose up --build -d

echo.
echo ================================================
echo   StockViewer is starting!
echo ================================================
echo.
echo   App URL:     http://localhost:3000
echo   AKTools API: http://localhost:8080
echo.
echo   Note: AKTools may take 1-2 minutes to fully start.
echo         Wait for the health check to pass.
echo.
echo   Commands:
echo     View logs:    docker compose logs -f
echo     Stop:         docker compose down
echo     Stop ^& clean: docker compose down -v
echo.

REM Wait and show status
timeout /t 5 /nobreak >nul

docker compose ps

echo.
echo Check logs with: cd docker ^&^& docker compose logs -f
echo.
pause
