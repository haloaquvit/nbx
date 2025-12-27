@echo off
echo ========================================
echo Building Aquvit APK for NABIRE Server
echo ========================================
echo.

cd /d "%~dp0.."

echo [1/3] Building web assets for Nabire...
call npm run build:nabire
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Syncing with Capacitor...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Capacitor sync failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Building APK with Gradle...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo ERROR: Gradle build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! APK built for Nabire server
echo ========================================
echo.
echo APK Location: android\app\build\outputs\apk\debug\app-debug.apk
echo Rename to: aquvit-nabire.apk
echo.
echo Server: https://nbx.aquvit.id
echo.
pause
