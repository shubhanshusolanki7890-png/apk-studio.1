import { execFile } from 'child_process';
import util from 'util';
import { CONFIG } from '../config';

const execFileAsync = util.promisify(execFile);

export type PythonSupportTier = 'supported' | 'requires_modification' | 'unsupported';

export interface PythonInspectionResult {
  supported: boolean;
  classification: PythonSupportTier;
  entrypoint?: string | null;
  has_html_bridge: boolean;
  python_files: string[];
  detected_imports: string[];
  declared_dependencies: string[];
  native_or_heavy_dependencies: Array<{ package: string; note: string }>;
  modification_reasons: string[];
  unsupported_modules: Array<{ module: string; reason: string; file?: string }>;
  recommendations: string[];
  error?: string;
}

export class PythonService {
  public static async inspectProject(projectDirectory: string): Promise<PythonInspectionResult> {
    try {
      const { stdout } = await execFileAsync('python3', [
        CONFIG.PYTHON_ANALYZER_SCRIPT,
        projectDirectory
      ]);
      return JSON.parse(stdout) as PythonInspectionResult;
    } catch (err: any) {
      return {
        supported: false,
        classification: 'unsupported',
        entrypoint: null,
        has_html_bridge: false,
        python_files: [],
        detected_imports: [],
        declared_dependencies: [],
        native_or_heavy_dependencies: [],
        modification_reasons: [],
        unsupported_modules: [],
        recommendations: ['Verify Python 3 is installed and the project directory is readable.'],
        error: `Python analyzer failure: ${err.message}`
      };
    }
  }

  public static async generateWebViewBridge(
    projectDirectory: string,
    projectName: string,
    entrypoint = 'main.py'
  ): Promise<string> {
    const { stdout } = await execFileAsync('python3', [
      CONFIG.PYTHON_BRIDGE_SCRIPT,
      projectDirectory,
      projectName,
      entrypoint
    ]);
    return stdout.trim();
  }
}
