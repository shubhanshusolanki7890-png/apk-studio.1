import { BuildService } from '../services/build.service';
import { SUPPORTED_ANDROID_PERMISSIONS } from '../validators/project.validator';

export class SystemController {
  public static getDiagnostics(_req: any, res: any): void {
    const toolchain = BuildService.checkToolchain();
    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      toolchain,
      supportedPermissions: SUPPORTED_ANDROID_PERMISSIONS
    });
  }
}
