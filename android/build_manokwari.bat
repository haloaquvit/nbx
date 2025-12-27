@echo off
echo ========================================
echo Building Aquvit APK for MANOKWARI Server
echo ========================================
echo.

cd /d "%~dp0.."

echo [1/4] Setting server URL to Manokwari...
powershell -Command "(Get-Content capacitor.config.ts) -replace \"url: 'https://nbx.aquvit.id'\", \"url: 'https://mkw.aquvit.id'\" | Set-Content capacitor.config.ts"
echo Server URL set to: https://mkw.aquvit.id

echo.
echo [2/4] Building web assets for Manokwari...
call npm run build:manokwari
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [3/4] Syncing with Capacitor...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Capacitor sync failed!
    pause
    exit /b 1
)

echo.
echo [4/4] Building APK with Gradle...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo ERROR: Gradle build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! APK built for Manokwari server
echo ========================================
echo.
echo APK Location: android\app\build\outputs\apk\debug\app-debug.apk
echo Rename to: aquvit-manokwari.apk
echo.
echo Server: https://mkw.aquvit.id
echo.
echo NOTE: APK loads from LIVE URL - no need to rebuild for web updates!
echo.
pause
