@rem Gradle startup script for Windows (APK STUDIO Android Template)
@echo off
set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.
set WRAPPER_JAR=%DIRNAME%\gradle\wrapper\gradle-wrapper.jar

if exist "%WRAPPER_JAR%" (
    java -Xmx64m -Xms64m -classpath "%WRAPPER_JAR%" org.gradle.wrapper.GradleWrapperMain %*
    exit /b %ERRORLEVEL%
)

where gradle >nul 2>nul
if %ERRORLEVEL% equ 0 (
    gradle -p "%DIRNAME%" %*
    exit /b %ERRORLEVEL%
)

echo ERROR: Neither gradle-wrapper.jar nor a system 'gradle' binary was found. 1>&2
exit /b 127
