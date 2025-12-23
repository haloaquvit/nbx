@echo off
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
cd /d "D:\App\Aquvit Fix - Copy\android"
call gradlew.bat assembleDebug
echo.
echo APK Location: D:\App\Aquvit Fix - Copy\android\app\build\outputs\apk\debug\app-debug.apk
pause
