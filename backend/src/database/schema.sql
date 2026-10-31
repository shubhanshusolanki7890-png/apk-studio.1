CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('html', 'python')),
    status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('draft', 'ready', 'built', 'error')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_customization (
    project_id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    package_id TEXT NOT NULL,
    version_name TEXT NOT NULL DEFAULT '1.0.0',
    version_code INTEGER NOT NULL DEFAULT 1,
    orientation TEXT NOT NULL DEFAULT 'portrait' CHECK(orientation IN ('portrait', 'landscape', 'unspecified')),
    fullscreen INTEGER NOT NULL DEFAULT 0,
    status_bar_color TEXT NOT NULL DEFAULT '#1f1c2c',
    nav_bar_color TEXT NOT NULL DEFAULT '#1f1c2c',
    light_status_bar INTEGER NOT NULL DEFAULT 0,
    theme_color TEXT NOT NULL DEFAULT '#6c5ce7',
    background_color TEXT NOT NULL DEFAULT '#1f1c2c',
    offline_mode TEXT NOT NULL DEFAULT 'cache_first' CHECK(offline_mode IN ('cache_first', 'network_first', 'offline_only')),
    allow_cleartext INTEGER NOT NULL DEFAULT 1,
    enable_zoom INTEGER NOT NULL DEFAULT 0,
    keep_screen_on INTEGER NOT NULL DEFAULT 0,
    splash_enabled INTEGER NOT NULL DEFAULT 1,
    splash_color TEXT NOT NULL DEFAULT '#1f1c2c',
    splash_duration_ms INTEGER NOT NULL DEFAULT 1500,
    splash_animation TEXT NOT NULL DEFAULT 'fade' CHECK(splash_animation IN ('fade', 'scale', 'slide', 'pulse', 'none')),
    icon_data_url TEXT,
    splash_image_data_url TEXT,
    permissions TEXT NOT NULL DEFAULT '["android.permission.INTERNET","android.permission.ACCESS_NETWORK_STATE"]',
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_animations (
    project_id TEXT PRIMARY KEY,
    splash_animation TEXT NOT NULL DEFAULT 'fade' CHECK(splash_animation IN ('fade', 'scale', 'slide', 'pulse', 'none')),
    splash_duration_ms INTEGER NOT NULL DEFAULT 1500,
    pulse_duration_s REAL NOT NULL DEFAULT 2.0,
    glass_blur_px INTEGER NOT NULL DEFAULT 30,
    page_transition TEXT NOT NULL DEFAULT 'fade' CHECK(page_transition IN ('fade', 'slide-up', 'zoom', 'none')),
    loader_style TEXT NOT NULL DEFAULT 'spinner' CHECK(loader_style IN ('spinner', 'pulse-ring', 'progress-bar', 'dots', 'none')),
    button_effect TEXT NOT NULL DEFAULT 'scale-press' CHECK(button_effect IN ('scale-press', 'glow-hover', 'ripple', 'none')),
    inject_stylesheet INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS builds (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    build_type TEXT NOT NULL DEFAULT 'debug' CHECK(build_type IN ('debug', 'release')),
    status TEXT NOT NULL CHECK(status IN ('queued', 'building', 'success', 'failed')),
    stage TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    log TEXT DEFAULT '',
    apk_filename TEXT,
    apk_size_bytes INTEGER,
    error_summary TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
