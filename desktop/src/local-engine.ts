import { app, dialog } from 'electron';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LOG_LINES = 1000;
const BLOCKED_SEGMENTS = new Set([
  '.git',
  '.env',
  '.venv',
  'venv',
  'node_modules',
  '.next',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'dist',
  'build',
  '.cache',
]);
const ALLOWED_EXTENSIONS = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.md',
  '.json',
  '.toml',
  '.yaml',
  '.yml',
  '.txt',
  '.css',
  '.scss',
  '.html',
  '.csv',
  '.xml',
]);

interface ManagedProcess {
  process: ChildProcessWithoutNullStreams;
  startedAt: string;
}

interface EngineStatus {
  electron: true;
  calismaKoku: string | null;
  worker: { calisiyor: boolean; pid: number | null; baslamaZamani: string | null };
}

let worker: ManagedProcess | null = null;
let workspaceRoot: string | null = null;
const logs: string[] = [];

function appendLog(source: string, chunk: Buffer | string): void {
  for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
    logs.push(`[${new Date().toISOString()}] [${source}] ${line}`);
  }
  if (logs.length > MAX_LOG_LINES) logs.splice(0, logs.length - MAX_LOG_LINES);
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'local-engine.json');
}

function loadRoot(): string | null {
  if (workspaceRoot) return workspaceRoot;
  try {
    const value = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as { workspaceRoot?: string };
    if (value.workspaceRoot) workspaceRoot = validateWorkspaceRoot(value.workspaceRoot);
  } catch {
    workspaceRoot = null;
  }
  return workspaceRoot;
}

function saveRoot(root: string): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ workspaceRoot: root }, null, 2), 'utf8');
}

function validateWorkspaceRoot(candidate: string): string {
  const real = fs.realpathSync(candidate);
  const required = path.join(real, 'worker', 'main.py');
  if (!fs.statSync(real).isDirectory() || !fs.existsSync(required)) {
    throw new Error('Seçilen klasör İcmal Veri çalışma kökü değil (worker/main.py bulunamadı).');
  }
  return real;
}

function requireRoot(): string {
  const root = loadRoot();
  if (!root) throw new Error('Önce İcmal Veri çalışma kökünü seçin.');
  return validateWorkspaceRoot(root);
}

function isBlocked(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => {
    const lower = segment.toLowerCase();
    return BLOCKED_SEGMENTS.has(lower) || lower.startsWith('.env') || lower.includes('secret');
  });
}

function safePath(relativePath = '', fileOnly = false): string {
  if (path.isAbsolute(relativePath) || relativePath.includes('\0') || isBlocked(relativePath)) {
    throw new Error('Bu çalışma alanı yolu güvenlik ilkesi tarafından engellendi.');
  }
  const root = requireRoot();
  const candidate = path.resolve(root, relativePath.replaceAll('/', path.sep));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error('Çalışma kökü dışındaki yollara erişilemez.');
  }
  if (fs.existsSync(candidate)) {
    const real = fs.realpathSync(candidate);
    if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
      throw new Error('Sembolik bağlantı çalışma kökü dışına çıkıyor.');
    }
    if (fileOnly && !fs.statSync(real).isFile()) throw new Error('Seçilen yol bir dosya değil.');
    return real;
  }
  throw new Error('Çalışma alanı yolu bulunamadı.');
}

function languageFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return (
    (
      {
        '.py': 'python',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.sql': 'sql',
        '.md': 'markdown',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.css': 'css',
        '.scss': 'scss',
        '.html': 'html',
        '.xml': 'xml',
      } as Record<string, string>
    )[extension] ?? 'plaintext'
  );
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function attachProcess(
  source: string,
  processHandle: ChildProcessWithoutNullStreams,
): ManagedProcess {
  processHandle.stdout.on('data', (chunk: Buffer) => appendLog(source, chunk));
  processHandle.stderr.on('data', (chunk: Buffer) => appendLog(source, chunk));
  processHandle.on('error', (error) => appendLog(source, error.message));
  return { process: processHandle, startedAt: new Date().toISOString() };
}

function alive(value: ManagedProcess | null): value is ManagedProcess {
  return Boolean(value && value.process.exitCode === null && !value.process.killed);
}

function stopManaged(value: ManagedProcess | null, source: string): void {
  if (!alive(value)) return;
  value.process.kill();
  appendLog(source, 'Yönetilen süreç durduruldu.');
}

export async function getEngineStatus(): Promise<EngineStatus> {
  return {
    electron: true,
    calismaKoku: loadRoot(),
    worker: {
      calisiyor: alive(worker),
      pid: alive(worker) ? (worker.process.pid ?? null) : null,
      baslamaZamani: alive(worker) ? worker.startedAt : null,
    },
  };
}

export async function chooseWorkspace(): Promise<EngineStatus> {
  const result = await dialog.showOpenDialog({
    title: 'İcmal Veri çalışma kökünü seçin',
    properties: ['openDirectory'],
  });
  if (!result.canceled && result.filePaths[0]) {
    workspaceRoot = validateWorkspaceRoot(result.filePaths[0]);
    saveRoot(workspaceRoot);
    appendLog('electron', `Çalışma kökü seçildi: ${workspaceRoot}`);
  }
  return getEngineStatus();
}

export async function startLocalEngine(): Promise<EngineStatus> {
  const root = requireRoot();
  if (alive(worker)) return getEngineStatus();
  const candidates = [
    path.join(root, '.venv', 'Scripts', 'python.exe'),
    path.join(root, 'venv', 'Scripts', 'python.exe'),
  ];
  const python = candidates.find((candidate) => fs.existsSync(candidate));
  if (!python)
    throw new Error('Güvenli Python çalıştırıcısı bulunamadı (.venv/Scripts/python.exe).');
  worker = attachProcess(
    'worker',
    spawn(python, ['-m', 'worker.main'], {
      cwd: root,
      env: { ...process.env, KAMU_POZ_WORKSPACE_ROOT: root },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );
  worker.process.once('exit', (code) =>
    appendLog('worker', `Süreç kapandı (kod ${code ?? 'yok'}).`),
  );
  return getEngineStatus();
}

export async function stopLocalEngine(): Promise<EngineStatus> {
  stopManaged(worker, 'worker');
  worker = null;
  return getEngineStatus();
}

export function stopAllManagedProcesses(): void {
  stopManaged(worker, 'worker');
  worker = null;
}

export function readEngineLogs(): string[] {
  return [...logs];
}

export function listWorkspace(
  relativePath = '',
): Array<{
  ad: string;
  yol: string;
  tur: 'dosya' | 'klasor';
  boyut?: number;
  degistirilmeZamani?: string;
}> {
  const root = requireRoot();
  const directory = safePath(relativePath);
  if (!fs.statSync(directory).isDirectory()) throw new Error('Seçilen yol bir klasör değil.');
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => {
      const relative = path.relative(root, path.join(directory, entry.name));
      return (
        !isBlocked(relative) &&
        (entry.isDirectory() || ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      );
    })
    .map((entry) => {
      const absolute = path.join(directory, entry.name);
      const stat = fs.statSync(absolute);
      return {
        ad: entry.name,
        yol: path.relative(root, absolute).replaceAll('\\', '/'),
        tur: entry.isDirectory() ? ('klasor' as const) : ('dosya' as const),
        ...(entry.isFile() ? { boyut: stat.size } : {}),
        degistirilmeZamani: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) =>
      a.tur === b.tur ? a.ad.localeCompare(b.ad, 'tr') : a.tur === 'klasor' ? -1 : 1,
    );
}

export function readWorkspaceFile(relativePath: string): {
  path: string;
  content: string;
  sha256: string;
  language: string;
} {
  if (!ALLOWED_EXTENSIONS.has(path.extname(relativePath).toLowerCase()))
    throw new Error('Bu dosya türü kod editöründe açılamaz.');
  const absolute = safePath(relativePath, true);
  const stat = fs.statSync(absolute);
  if (stat.size > MAX_FILE_BYTES) throw new Error('Dosya 1 MB güvenli önizleme sınırını aşıyor.');
  const content = fs.readFileSync(absolute, 'utf8');
  return {
    path: path.relative(requireRoot(), absolute).replaceAll('\\', '/'),
    content,
    sha256: sha256(content),
    language: languageFor(absolute),
  };
}

export function writeWorkspaceFile(input: {
  path: string;
  content: string;
  expectedSha256: string;
}): { path: string; sha256: string; snapshot: string } {
  if (Buffer.byteLength(input.content, 'utf8') > MAX_FILE_BYTES)
    throw new Error('Yeni içerik 1 MB güvenli yazma sınırını aşıyor.');
  const absolute = safePath(input.path, true);
  const original = fs.readFileSync(absolute);
  if (sha256(original) !== input.expectedSha256)
    throw new Error(
      'DOSYA_DISARIDAN_DEGISTI: Dosyayı yeniden açıp değişikliği tekrar değerlendirin.',
    );
  const root = requireRoot();
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const snapshotRelative = path.join('storage', 'admin-snapshots', stamp, input.path);
  const snapshot = path.join(root, snapshotRelative);
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  fs.writeFileSync(snapshot, original);
  fs.writeFileSync(absolute, input.content, 'utf8');
  appendLog('workspace', `${input.path} güncellendi; snapshot ${snapshotRelative}`);
  return {
    path: input.path,
    sha256: sha256(input.content),
    snapshot: snapshotRelative.replaceAll('\\', '/'),
  };
}
