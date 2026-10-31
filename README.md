APK Studio: In-Browser Web-to-APK IDE & Build Engine
APK Studio is a mobile-first, browser-based integrated development environment designed to build, preview, and package modern web applications into production-ready Android APKs. It combines a custom Liquid Glass UI, sandboxed live preview runtime, local file management, and an automated GitHub Actions CI/CD pipeline using modern Android WebView security standards.
Key Features
1. Liquid Glass Interface & Theming
 * Optical Refraction Engine: Employs an embedded SVG filter pipeline (feTurbulence and feDisplacementMap) for realistic glassmorphism effects.
 * Dual-Layer Architecture: Decouples background refraction (.glass-backdrop) from interface text and code editors (.panel-content) to preserve typography sharpness.
 * Adaptive Responsive Layout: Mobile-optimized single-column flow that expands into a dual-pane sidebar layout on viewports 768px and wider.
 * Persistent Theming: Light and dark modes with floating background canvas elements, persisted across sessions via local storage.
2. System Diagnostics & Pre-Flight Validation
 * Real-Time Telemetry: Monitors project health, active file count, total bundle size (KB), and browser storage limits.
 * Pre-Flight Validation Engine: Automatically validates Android configuration prior to build triggers:
   * Package ID syntax (com.company.app)
   * Semantic versioning format
   * SDK boundary targets (Minimum SDK 24 / Target SDK 34)
   * Root entry point verification (index.html)
3. Workspace, Templates & Archive Management
 * Starter Templates: Preloaded architectures for rapid prototyping:
   * Liquid Glass WebApp
   * Responsive Multi-Section Application
   * Offline Expense Tracker
   * Android WebView Bridge Tester
 * Project & File Management: Full CRUD operations for projects, folders, and files with batch asset upload and single-click full-archive backup.
 * Zip-Slip Safe Engine: Sanitized path extraction preventing directory traversal vulnerabilities during .zip imports and exports.
4. Mobile-First Code Editor
 * Multi-Tab Workspace: Context-aware tab switching with real-time tracking of unsaved changes.
 * Mobile Symbol Row: Quick-access touch keyboard bar for common coding characters: Tab, {, }, (, ), [, ], <, >, /, =, ", ', ;, :, $, !.
 * Search & Replace Drawer: Integrated in-file regex search, match counter, and bulk replacement.
 * Autosave Pipeline: 500ms debounced persistence to IndexedDB (apk_studio_idb_v2) with automatic fallback to LocalStorage.
5. Sandboxed Runtime & Virtual Console
 * Isolated Execution: Sandboxed preview iframe (sandbox="allow-scripts") isolating running code from the IDE application scope.
 * Responsive Viewport Frames: Presets for Phone (360×640), Tablet (540×680), and Responsive Full-Width, including orientation toggling (Portrait/Landscape).
 * Virtual Developer Console: In-app capture and display of console.log, warn, info, error, and unhandled runtime exceptions.
6. App Identity, Launcher Icon & System Controls
 * Manifest Customization: Visual controls for Application Name, Package ID, Version Name, and Version Code.
 * Icon Studio: In-browser image upload with automated dimension and format verification.
 * System Chrome Customizer: Dynamic hex color selection for Android Status and Navigation bars, plus an immersive fullscreen toggle.
 * Splash Screen Engine: Configurable display duration and animation presets (Liquid Glass Pulse, Smooth Crossfade, Scale-Up, Slide-Up).
 * Permission Matrix: Granular toggles for common Android permissions:
   * android.permission.INTERNET
   * android.permission.CAMERA
   * android.permission.RECORD_AUDIO
   * android.permission.VIBRATE
   * android.permission.ACCESS_FINE_LOCATION
7. Android Shell & Modern WebView Architecture
 * WebViewAssetLoader: Deprecates insecure file:/// protocols in favor of androidx.webkit.WebViewAssetLoader, serving assets through strict domain isolation at:
   https://appassets.androidplatform.net/assets/webapp/index.html

 * Native JavaScript Bridge: Exposes native Android bindings via AndroidStudioBridge.showToast(message) for cross-layer communication.
 * Native File Chooser: Implements WebChromeClient.onShowFileChooser in MainActivity.java to support standard HTML file inputs (<input type="file">).
 * Core Build System: Configured for Android Gradle Plugin 8.2.2, Gradle 8.5, Target SDK 34, and Java 17.
8. Self-Extracting GitHub Actions CI/CD
 * Zero-Dependency AST Bundler: In-browser AST compiler bundles TypeScript and React modules directly into app-shell/app/src/main/assets/webapp/ without requiring local npm install runs.
 * Automated Workflow (build-apk.yml):
   * Detects project changes or archive pushes (apk-studio.zip).
   * Unpacks the project tree on the GitHub Actions runner.
   * Verifies and prepares bundled web assets.
   * Compiles using ./gradlew assembleDebug.
   * Exports and uploads app-debug.apk directly to GitHub workflow artifacts.
Project Structure
├── .github/
│   └── workflows/
│       └── build-apk.yml           # Automated CI/CD build and packaging pipeline
├── app-shell/                      # Native Android wrapper project
│   ├── app/
│   │   ├── src/
│   │   │   └── main/
│   │   │       ├── assets/
│   │   │       │   └── webapp/     # Target directory for compiled web assets
│   │   │       ├── java/           # MainActivity, WebView bridge, AssetLoader config
│   │   │       └── AndroidManifest.xml
│   │   └── build.gradle            # App-level build configurations (AGP 8.2.2)
│   ├── gradle/
│   └── build.gradle                # Project-level build configurations
└── src/                            # Web IDE core source
    ├── editor/                     # Code editor, symbol bar, find-replace engine
    ├── preview/                    # Sandboxed iframe, virtual console, frame switcher
    ├── project/                    # File explorer, zip engine, template manager
    ├── theme/                      # SVG refraction filters, glass styles, themes
    └── validator/                  # Android pre-flight diagnostic rules

Getting Started
Local Development
 * Clone the repository:
   git clone https://github.com/your-username/apk-studio.git
cd apk-studio

 * Open the project in any standard static web server:
   npx serve .

 * Open http://localhost:3000 in a browser.
Building an APK via GitHub Actions
 * Export your project from the IDE as an archive or commit changes directly.
 * Push your project to the main branch.
 * The .github/workflows/build-apk.yml workflow triggers automatically.
 * Once completed, navigate to the Actions tab on GitHub, select the latest run, and download the app-debug.apk artifact.
Security Specifications
| Layer | Implementation | Purpose |
|---|---|---|
| Storage & Archiving | Canonical Path Sanitization | Blocks directory traversal exploits during .zip file ingestion. |
| Runtime Preview | iframe sandbox="allow-scripts" | Isolates untrusted preview code from the host IDE state and cookies. |
| Android WebView | WebViewAssetLoader | Enforces HTTPS origin matching, preventing SOP bypasses and file:// attacks. |
Technical Specifications
 * Minimum Android SDK: 24 (Android 7.0 Nougat)
 * Target Android SDK: 34 (Android 14)
 * Java Compatibility: OpenJDK 17
 * Gradle Version: 8.5
 * Android Gradle Plugin (AGP): 8.2.2
 * Internal Storage Engine: IndexedDB (apk_studio_idb_v2)
