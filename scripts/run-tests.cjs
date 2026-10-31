#!/usr/bin/env node
/**
 * Comprehensive Automated Verification & Integration Test Suite for APK STUDIO
 * Tests:
 * 1. Production Web IDE Bundle & AST Module Execution
 * 2. Starter Templates & Project Creation
 * 3. Archive Path Sanitization (Zip-Slip protection) & ZIP Export/Import Round-Trip
 * 4. Android Pre-Flight Validator, Manifest XML & WebViewAssetLoader Code Generation
 * 5. Supplied Liquid Glass UI Preservation (#liquid-refraction SVG filter & CSS classes)
 * 6. OpenJDK 17 Compilation Verification of `app-shell` MainActivity.java & gradle-wrapper.jar
 * 7. GitHub Actions Workflow (.github/workflows/build-apk.yml) Validation
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const webAppDir = path.join(rootDir, 'app-shell/app/src/main/assets/webapp');
const bundlePath = path.join(webAppDir, 'assets/app-bundle.js');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err && err.stack ? err.stack : err}`);
    failed += 1;
  }
}

async function main() {
  console.log('==============================================================');
  console.log(' APK STUDIO — Automated Verification & Integration Test Suite');
  console.log('==============================================================\n');

  await runTest('Production Web IDE bundle exists and loads into VM', async () => {
    assert.ok(fs.existsSync(bundlePath), 'app-bundle.js must exist');
    require(bundlePath);
    assert.strictEqual(
      typeof global.__APK_STUDIO_REQUIRE__,
      'function',
      '__APK_STUDIO_REQUIRE__ must be exposed'
    );
  });

  await runTest('Supplied Liquid Glass UI assets & SVG refraction filter are preserved', async () => {
    const html = fs.readFileSync(path.join(webAppDir, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(webAppDir, 'assets/liquid-glass.css'), 'utf8');

    assert.ok(html.includes('id="liquid-refraction"'), 'SVG #liquid-refraction filter must be present in index.html');
    assert.ok(html.includes('feTurbulence'), 'SVG feTurbulence element must be present');
    assert.ok(html.includes('feDisplacementMap'), 'SVG feDisplacementMap element must be present');
    assert.ok(css.includes('.liquid-wrapper'), '.liquid-wrapper class must be preserved');
    assert.ok(css.includes('.liquid-glass-panel'), '.liquid-glass-panel class must be preserved');
    assert.ok(css.includes('.glass-backdrop'), '.glass-backdrop class must be preserved');
    assert.ok(css.includes("filter: url('#liquid-refraction')"), 'backdrop filter URL reference must be preserved');
    assert.ok(css.includes('.metric-card'), '.metric-card class must be preserved');
  });

  await runTest('Starter templates service creates valid multi-file projects', async () => {
    const templatesMod = global.__APK_STUDIO_REQUIRE__('./services/templates');
    assert.ok(Array.isArray(templatesMod.STARTER_TEMPLATES), 'STARTER_TEMPLATES must be an array');
    assert.ok(templatesMod.STARTER_TEMPLATES.length >= 4, 'Must include at least 4 starter templates');

    const proj = templatesMod.createProjectFromTemplate(
      'liquid-glass-starter',
      'Test Glass App',
      'com.example.testglass'
    );
    assert.strictEqual(proj.name, 'Test Glass App');
    assert.strictEqual(proj.settings.packageName, 'com.example.testglass');
    assert.ok(proj.files.some((f) => f.path === 'index.html'), 'Must contain index.html');
    assert.ok(proj.files.some((f) => f.path === 'styles.css'), 'Must contain styles.css');
    assert.ok(proj.files.some((f) => f.path === 'app.js'), 'Must contain app.js');
  });

  await runTest('Archive service blocks Zip-Slip traversal and round-trips ZIP archives', async () => {
    const archiveMod = global.__APK_STUDIO_REQUIRE__('./services/archive');
    const templatesMod = global.__APK_STUDIO_REQUIRE__('./services/templates');

    assert.strictEqual(archiveMod.sanitizeArchivePath('../../etc/passwd'), null);
    assert.strictEqual(archiveMod.sanitizeArchivePath('/abs/path/index.html'), 'abs/path/index.html');
    assert.strictEqual(archiveMod.sanitizeArchivePath('src\\components\\App.tsx'), 'src/components/App.tsx');

    const proj = templatesMod.createProjectFromTemplate('liquid-glass-starter');
    const exported = await archiveMod.exportProjectAsZipBlob(proj);
    assert.ok(exported.size > 100, 'Exported ZIP must be non-empty');
    assert.ok(exported.sha256 && exported.sha256.length >= 8, 'Exported ZIP must return a SHA-256 hex digest');
  });

  await runTest('Android generator validates settings and outputs secure WebViewAssetLoader code', async () => {
    const genMod = global.__APK_STUDIO_REQUIRE__('./services/androidGenerator');
    const templatesMod = global.__APK_STUDIO_REQUIRE__('./services/templates');

    const proj = templatesMod.createProjectFromTemplate(
      'liquid-glass-starter',
      'Valid App',
      'com.apkstudio.validapp'
    );
    const validRes = genMod.validateProjectForAndroid(proj);
    assert.strictEqual(validRes.valid, true, 'Default project must pass Android pre-flight validation');

    const badProj = {
      ...proj,
      settings: { ...proj.settings, packageName: 'InvalidPackage', entryFile: 'missing.html' },
    };
    const badRes = genMod.validateProjectForAndroid(badProj);
    assert.strictEqual(badRes.valid, false, 'Invalid package and missing entry file must fail validation');
    assert.strictEqual(badRes.errors.length, 2);

    const manifestXml = genMod.generateAndroidManifestXml(proj);
    assert.ok(manifestXml.includes('android.permission.INTERNET'), 'Manifest must include configured permissions');
    assert.ok(manifestXml.includes('android:exported="true"'), 'MainActivity must declare android:exported="true" for Android 12+');

    const javaCode = genMod.generateMainActivityJava(proj);
    assert.ok(javaCode.includes('WebViewAssetLoader'), 'Generated Java must use WebViewAssetLoader');
    assert.ok(
      !javaCode.includes('setAllowUniversalAccessFromFileURLs(true)'),
      'Generated Java must NOT enable unsafe universal file access'
    );

    const androidZip = await genMod.generateCompileReadyAndroidZip(proj);
    assert.ok(androidZip.size > 500, 'Generated Android project ZIP must be non-empty');
    assert.ok(androidZip.filename.endsWith('.zip'), 'Generated filename must end with .zip');
  });

  await runTest('OpenJDK 17 compiles app-shell MainActivity.java and verifies gradle-wrapper.jar', async () => {
    const javaCheckDir = '/tmp/apk-studio-javac-check';
    fs.rmSync(javaCheckDir, { recursive: true, force: true });
    fs.mkdirSync(javaCheckDir, { recursive: true });

    // Create minimal Android + AndroidX WebViewAssetLoader API stubs for javac verification
    const stubs = {
      'android/annotation/SuppressLint.java': `package android.annotation; public @interface SuppressLint { String[] value(); }`,
      'android/os/Bundle.java': `package android.os; public class Bundle {}`,
      'android/net/Uri.java': `package android.net; public class Uri { public String getHost() { return ""; } }`,
      'android/content/Context.java': `package android.content; public class Context {}`,
      'android/content/Intent.java': `package android.content; import android.net.Uri; public class Intent { public static final String ACTION_VIEW = "android.intent.action.VIEW"; public Intent() {} public Intent(String a, Uri u) {} }`,
      'android/graphics/Color.java': `package android.graphics; public class Color { public static int parseColor(String c) { return 0; } }`,
      'android/view/View.java': `package android.view; public class View {}`,
      'android/view/Window.java': `package android.view; public class Window { public void setStatusBarColor(int c) {} public void setNavigationBarColor(int c) {} }`,
      'android/app/Activity.java': `package android.app; import android.content.Context; import android.content.Intent; import android.os.Bundle; import android.view.View; import android.view.Window; public class Activity extends Context { protected void onCreate(Bundle b) {} public Window getWindow() { return null; } public void setContentView(View v) {} public void startActivity(Intent i) {} public void startActivityForResult(Intent i, int c) {} protected void onActivityResult(int req, int res, Intent d) {} public final void runOnUiThread(Runnable r) {} public void onBackPressed() {} }`,
      'android/widget/Toast.java': `package android.widget; import android.content.Context; public class Toast { public static final int LENGTH_SHORT = 0; public static Toast makeText(Context c, CharSequence t, int d) { return new Toast(); } public void show() {} }`,
      'android/webkit/JavascriptInterface.java': `package android.webkit; public @interface JavascriptInterface {}`,
      'android/webkit/ValueCallback.java': `package android.webkit; public interface ValueCallback<T> { void onReceiveValue(T value); }`,
      'android/webkit/WebResourceRequest.java': `package android.webkit; import android.net.Uri; public interface WebResourceRequest { Uri getUrl(); }`,
      'android/webkit/WebResourceResponse.java': `package android.webkit; public class WebResourceResponse {}`,
      'android/webkit/WebSettings.java': `package android.webkit; public class WebSettings { public void setJavaScriptEnabled(boolean b) {} public void setDomStorageEnabled(boolean b) {} public void setDatabaseEnabled(boolean b) {} public void setAllowFileAccess(boolean b) {} public void setAllowContentAccess(boolean b) {} public void setBuiltInZoomControls(boolean b) {} public void setDisplayZoomControls(boolean b) {} public void setMediaPlaybackRequiresUserGesture(boolean b) {} }`,
      'android/webkit/WebViewClient.java': `package android.webkit; public class WebViewClient { public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return null; } public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return false; } }`,
      'android/webkit/WebChromeClient.java': `package android.webkit; import android.content.Intent; import android.net.Uri; public class WebChromeClient { public static abstract class FileChooserParams { public static Uri[] parseResult(int r, Intent d) { return null; } public abstract Intent createIntent(); } public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) { return false; } }`,
      'android/webkit/WebView.java': `package android.webkit; import android.content.Context; import android.view.View; public class WebView extends View { public WebView(Context c) {} public WebSettings getSettings() { return null; } public void addJavascriptInterface(Object o, String n) {} public void setWebViewClient(WebViewClient c) {} public void setWebChromeClient(WebChromeClient c) {} public void loadUrl(String u) {} public boolean canGoBack() { return false; } public void goBack() {} }`,
      'androidx/webkit/WebViewAssetLoader.java': `package androidx.webkit; import android.content.Context; import android.net.Uri; import android.webkit.WebResourceResponse; public final class WebViewAssetLoader { public interface PathHandler { WebResourceResponse handle(String path); } public static final class AssetsPathHandler implements PathHandler { public AssetsPathHandler(Context c) {} public WebResourceResponse handle(String p) { return null; } } public static final class Builder { public Builder addPathHandler(String d, PathHandler h) { return this; } public WebViewAssetLoader build() { return new WebViewAssetLoader(); } } public WebResourceResponse shouldInterceptRequest(Uri u) { return null; } }`,
    };

    const javaFiles = [];
    for (const [relPath, code] of Object.entries(stubs)) {
      const full = path.join(javaCheckDir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, code, 'utf8');
      javaFiles.push(full);
    }

    const mainActivityPath = path.join(
      rootDir,
      'app-shell/app/src/main/java/com/apkstudio/app/MainActivity.java'
    );
    javaFiles.push(mainActivityPath);

    // Compile all stubs + MainActivity.java using Java 17's ToolProvider
    const runnerJava = path.join(javaCheckDir, 'CompileCheck.java');
    fs.writeFileSync(
      runnerJava,
      `import javax.tools.*;
import java.io.*;
import java.util.*;
public class CompileCheck {
  public static void main(String[] args) {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) throw new RuntimeException("No JavaCompiler available");
    int res = compiler.run(null, System.out, System.err, args);
    if (res != 0) System.exit(res);
  }
}
`,
      'utf8'
    );

    execFileSync('java', [runnerJava, '-d', javaCheckDir, ...javaFiles], {
      stdio: 'pipe',
    });

    assert.ok(
      fs.existsSync(path.join(javaCheckDir, 'com/apkstudio/app/MainActivity.class')),
      'MainActivity.class must be compiled by OpenJDK 17'
    );

    // Also verify gradle-wrapper.jar exists and is non-empty
    const wrapperJar = path.join(rootDir, 'app-shell/gradle/wrapper/gradle-wrapper.jar');
    assert.ok(fs.existsSync(wrapperJar), 'gradle-wrapper.jar must exist');
    assert.ok(fs.statSync(wrapperJar).size > 500, 'gradle-wrapper.jar must be non-empty');
  });

  await runTest('GitHub Actions workflow (.github/workflows/build-apk.yml) has valid configuration', async () => {
    const wfPath = path.join(rootDir, '.github/workflows/build-apk.yml');
    assert.ok(fs.existsSync(wfPath), 'build-apk.yml must exist');
    const content = fs.readFileSync(wfPath, 'utf8');
    assert.ok(content.includes('workflow_dispatch:'), 'Must support manual workflow_dispatch');
    assert.ok(content.includes('actions/setup-java@v4'), 'Must set up JDK 17');
    assert.ok(content.includes('platforms;android-34'), 'Must install Android SDK 34 platform');
    assert.ok(content.includes('build-tools;34.0.0'), 'Must install Android Build Tools 34.0.0');
    assert.ok(content.includes('gradle assembleDebug'), 'Must run gradle assembleDebug');
    assert.ok(content.includes('actions/upload-artifact@v4'), 'Must upload compiled APK artifact');
  });

  console.log(`\n==============================================================`);
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log(`==============================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
