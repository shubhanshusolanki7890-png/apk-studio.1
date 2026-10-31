import JSZip from 'jszip';
import { StudioProject } from '../types';
import { computeSha256Hex } from './archive';

export interface ProjectValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateProjectForAndroid(project: StudioProject): ProjectValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { settings, files } = project;

  if (!settings.appName.trim()) {
    errors.push('Application Name cannot be empty.');
  }

  const pkgRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
  if (!pkgRegex.test(settings.packageName.trim())) {
    errors.push(
      `Invalid Android Package Name "${settings.packageName}". Must follow reverse-domain format (e.g. com.company.app).`
    );
  }

  if (!/^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.]+)?$/.test(settings.versionName.trim())) {
    errors.push('Version Name must follow semantic format (e.g. 1.0.0).');
  }

  if (!Number.isInteger(settings.versionCode) || settings.versionCode < 1) {
    errors.push('Version Code must be a positive integer (>= 1).');
  }

  if (settings.minSdk < 21 || settings.minSdk > settings.targetSdk) {
    errors.push(`minSdk (${settings.minSdk}) must be between 21 and targetSdk (${settings.targetSdk}).`);
  }

  const entryExists = files.some((f) => f.path === settings.entryFile);
  if (!entryExists) {
    errors.push(`Entry file "${settings.entryFile}" was not found in project files.`);
  }

  if (!settings.iconDataUrl) {
    warnings.push('No custom app icon uploaded; the default adaptive vector launcher icon will be used.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function generateAndroidManifestXml(project: StudioProject): string {
  const { settings } = project;
  const permissionsXml = settings.permissions
    .map((perm) => `    <uses-permission android:name="${perm}" />`)
    .join('\n');

  const screenOrientation =
    settings.orientation === 'portrait'
      ? 'portrait'
      : settings.orientation === 'landscape'
      ? 'landscape'
      : 'unspecified';

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

${permissionsXml}

    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:usesCleartextTraffic="${settings.allowCleartextTraffic ? 'true' : 'false'}"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="${screenOrientation}"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
}

export function generateMainActivityJava(project: StudioProject): string {
  const { settings } = project;
  return `package ${settings.packageName};

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("${settings.statusBarColor || '#4f46e5'}"));
        window.setNavigationBarColor(Color.parseColor("${settings.navigationBarColor || '#0f172a'}"));
        ${
          settings.fullscreen
            ? 'window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);'
            : ''
        }

        webView = new WebView(this);
        setContentView(webView);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(${settings.enableJavaScript ? 'true' : 'false'});
        ws.setDomStorageEnabled(${settings.enableDomStorage ? 'true' : 'false'});
        ws.setDatabaseEnabled(true);
        ws.setBuiltInZoomControls(${settings.enableZoom ? 'true' : 'false'});
        ws.setDisplayZoomControls(false);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);

        webView.addJavascriptInterface(new NativeBridge(), "AndroidStudioBridge");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/webapp/${settings.entryFile}");
    }

    public class NativeBridge {
        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
}

export async function generateCompileReadyAndroidZip(
  project: StudioProject
): Promise<{ blob: Blob; sha256: string; size: number; filename: string }> {
  const zip = new JSZip();
  const { settings } = project;
  const pkgPath = settings.packageName.replace(/\./g, '/');

  zip.file(
    'settings.gradle',
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${settings.appName.replace(/[^a-zA-Z0-9_-]/g, '') || 'APKStudioApp'}"
include ':app'
`
  );

  zip.file(
    'build.gradle',
    `plugins {
    id 'com.android.application' version '8.2.2' apply false
}
`
  );

  zip.file(
    'gradle.properties',
    `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
`
  );

  zip.file(
    'app/build.gradle',
    `plugins {
    id 'com.android.application'
}

android {
    namespace '${settings.packageName}'
    compileSdk ${settings.targetSdk}

    defaultConfig {
        applicationId "${settings.packageName}"
        minSdk ${settings.minSdk}
        targetSdk ${settings.targetSdk}
        versionCode ${settings.versionCode}
        versionName "${settings.versionName}"
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.webkit:webkit:1.10.0'
}
`
  );

  zip.file('app/src/main/AndroidManifest.xml', generateAndroidManifestXml(project));
  zip.file(
    `app/src/main/java/${pkgPath}/MainActivity.java`,
    generateMainActivityJava(project)
  );
  zip.file(
    'app/src/main/res/values/strings.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${settings.appName.replace(/[<>&'"]/g, '')}</string>
</resources>
`
  );

  for (const file of project.files) {
    const assetPath = `app/src/main/assets/webapp/${file.path}`;
    if (file.isBinary && file.content.startsWith('data:')) {
      const commaIdx = file.content.indexOf(',');
      const base64 = commaIdx >= 0 ? file.content.slice(commaIdx + 1) : '';
      zip.file(assetPath, base64, { base64: true });
    } else {
      zip.file(assetPath, file.content);
    }
  }

  zip.file(
    '.github/workflows/build-apk.yml',
    `name: Build Android APK

on:
  workflow_dispatch:
  push:
    branches: [ "main", "master" ]

permissions:
  contents: read

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Android SDK Platform ${settings.targetSdk} & Build Tools
        run: |
          yes | sdkmanager --licenses || true
          sdkmanager "platforms;android-${settings.targetSdk}" "build-tools;34.0.0" "platform-tools"

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v3
        with:
          gradle-version: '8.5'

      - name: Build Debug APK
        run: gradle assembleDebug --no-daemon --stacktrace

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${settings.packageName}-debug-apk
          path: app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
`
  );

  const uint8 = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const sha256 = await computeSha256Hex(uint8);
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: 'application/zip' });
  const slug = settings.packageName.split('.').pop() || 'android-app';
  return {
    blob,
    sha256,
    size: uint8.byteLength,
    filename: `${slug}-android-project-v${settings.versionName}.zip`,
  };
}
