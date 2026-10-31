export type StudioTab =
  | 'overview'
  | 'workspace'
  | 'editor'
  | 'preview'
  | 'customize'
  | 'builder';

export interface ProjectFile {
  path: string;
  content: string;
  isBinary?: boolean;
  mimeType?: string;
  updatedAt: number;
}

export type OrientationOption = 'portrait' | 'landscape' | 'sensor';

export type SplashAnimationType = 'fade' | 'scale-up' | 'liquid-pulse' | 'slide-up';

export interface AndroidPermissionItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface ProjectSettings {
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  orientation: OrientationOption;
  fullscreen: boolean;
  statusBarColor: string;
  navigationBarColor: string;
  themeMode: 'light' | 'dark' | 'system';
  enableJavaScript: boolean;
  enableDomStorage: boolean;
  enableZoom: boolean;
  allowCleartextTraffic: boolean;
  entryFile: string;
  iconDataUrl: string | null;
  splashColor: string;
  splashTitle: string;
  splashTagline: string;
  splashDurationMs: number;
  splashAnimation: SplashAnimationType;
  pageTransition: 'none' | 'fade' | 'slide';
  permissions: string[];
  backendUrl: string;
  githubRepo: string;
  githubWorkflowFile: string;
  githubBranch: string;
}

export interface StudioProject {
  id: string;
  name: string;
  description: string;
  templateId: string;
  createdAt: number;
  updatedAt: number;
  files: ProjectFile[];
  settings: ProjectSettings;
}

export interface BuildStageLog {
  id: string;
  stage: 'validate' | 'bundle' | 'manifest' | 'gradle' | 'package' | 'verify';
  label: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  detail: string;
  timestamp: number;
}

export interface BuildRecord {
  id: string;
  projectId: string;
  projectName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  mode: 'android-project-zip' | 'backend-apk' | 'github-actions';
  status: 'running' | 'succeeded' | 'failed';
  createdAt: number;
  completedAt?: number;
  artifactName?: string;
  artifactSize?: number;
  sha256?: string;
  downloadUrl?: string;
  errorMessage?: string;
  stages: BuildStageLog[];
}

export interface ConsoleLogEntry {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}
