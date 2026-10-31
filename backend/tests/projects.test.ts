import { initDatabase } from '../src/database/db';
import { ProjectsController } from '../src/controllers/projects.controller';
import { FilesController } from '../src/controllers/files.controller';
import { StorageService } from '../src/services/storage.service';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    }
  };
  return res;
}

describe('ProjectsController & FilesController (End-to-End Persistence)', () => {
  let createdProjectId = '';
  let duplicatedProjectId = '';

  beforeAll(() => {
    initDatabase();
  });

  afterAll(() => {
    if (createdProjectId) {
      ProjectsController.delete({ params: { id: createdProjectId } }, createMockRes());
    }
    if (duplicatedProjectId) {
      ProjectsController.delete({ params: { id: duplicatedProjectId } }, createMockRes());
    }
  });

  it('creates an HTML5 project and persists starter files', () => {
    const res = createMockRes();
    ProjectsController.create({ body: { name: 'Storefront App', type: 'html' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Storefront App');
    createdProjectId = res.body.id;

    const treeRes = createMockRes();
    FilesController.getTree({ params: { projectId: createdProjectId } }, treeRes);
    const names = treeRes.body.map((n: any) => n.name);
    expect(names).toContain('index.html');
    expect(names).toContain('style.css');
    expect(names).toContain('script.js');
  });

  it('renames and duplicates a project while copying files on disk', () => {
    const renameRes = createMockRes();
    ProjectsController.rename(
      { params: { id: createdProjectId }, body: { name: 'Storefront Pro' } },
      renameRes
    );
    expect(renameRes.statusCode).toBe(200);
    expect(renameRes.body.name).toBe('Storefront Pro');

    const dupRes = createMockRes();
    ProjectsController.duplicate(
      { params: { id: createdProjectId }, body: { name: 'Storefront Pro Copy' } },
      dupRes
    );
    expect(dupRes.statusCode).toBe(201);
    expect(dupRes.body.name).toBe('Storefront Pro Copy');
    duplicatedProjectId = dupRes.body.id;

    const fileRead = StorageService.readFile(duplicatedProjectId, 'index.html');
    expect(fileRead.content).toContain('Storefront App');
  });

  it('saves, reads, and blocks path traversal on project files', () => {
    const saveRes = createMockRes();
    FilesController.saveContent(
      {
        params: { projectId: createdProjectId },
        body: { path: 'pages/catalog.html', content: '<h2>Catalog</h2>' }
      },
      saveRes
    );
    expect(saveRes.statusCode).toBe(200);

    const readRes = createMockRes();
    FilesController.getContent(
      { params: { projectId: createdProjectId }, query: { path: 'pages/catalog.html' } },
      readRes
    );
    expect(readRes.statusCode).toBe(200);
    expect(readRes.body.content).toBe('<h2>Catalog</h2>');

    expect(() => StorageService.readFile(createdProjectId, '../../etc/passwd')).toThrow(
      'Path traversal detected'
    );
  });
});
