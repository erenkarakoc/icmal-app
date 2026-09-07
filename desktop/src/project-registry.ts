import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type ProjectReference = {id: string; path: string; name: string; openedAt: string};

const MAX_ENTRIES = 200;

function sameFile(a: string, b: string): boolean {
  // Windows paths are case-insensitive; comparing resolved paths keeps one
  // reference per file instead of one per spelling.
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function parse(text: string): ProjectReference[] {
  const value: unknown = JSON.parse(text);
  const rows = Array.isArray(value) ? value : (value as {projects?: unknown})?.projects;
  if (!Array.isArray(rows)) throw new Error('Beklenmeyen kayıt biçimi.');
  const seen = new Set<string>();
  const out: ProjectReference[] = [];
  for (const row of rows) {
    const r = row as Partial<ProjectReference>;
    if (typeof r?.path !== 'string' || !r.path) continue;
    if (path.extname(r.path).toLowerCase() !== '.icmal') continue;
    const key = path.resolve(r.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : randomUUID(),
      path: r.path,
      name: typeof r.name === 'string' && r.name ? r.name : path.basename(r.path),
      openedAt: typeof r.openedAt === 'string' ? r.openedAt : new Date(0).toISOString(),
    });
  }
  return out.slice(0, MAX_ENTRIES);
}

/**
 * A durable list of the .icmal files the user has opened or created. It stores
 * references only — never project content — so removing an entry never touches
 * the file on disk.
 */
export class ProjectRegistry {
  private entries: ProjectReference[] | null = null;
  /** Set when the file could not be read or written; surfaced to the user once. */
  private fault: string | null = null;
  // A plain field, not a constructor parameter property: the tests import this
  // module directly and Node's type stripping rejects parameter properties.
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  /**
   * A damaged or unreadable registry must not stop the app or lose the user's
   * work, so it degrades to an empty list and reports the fault separately.
   */
  private async load(): Promise<ProjectReference[]> {
    if (this.entries) return this.entries;
    try {
      this.entries = parse(await fs.readFile(this.file, 'utf8'));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') this.fault = 'Yerel proje listesi okunamadı; liste bu oturumda boş başladı.';
      this.entries = [];
    }
    return this.entries;
  }

  private async persist(): Promise<void> {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(path.dirname(this.file), {recursive: true});
      await fs.writeFile(temp, JSON.stringify({projects: this.entries ?? []}, null, 2), {mode: 0o600});
      await fs.rename(temp, this.file);
      this.fault = null;
    } catch {
      // Keep the in-memory list usable for this session rather than throwing
      // into a save the user already completed on disk.
      this.fault = 'Yerel proje listesi kaydedilemedi; bu oturumdaki değişiklikler kalıcı olmayabilir.';
      await fs.unlink(temp).catch(() => {});
    }
  }

  async list(): Promise<{projects: (ProjectReference & {missing: boolean})[]; fault: string | null}> {
    const entries = await this.load();
    const projects = await Promise.all(entries.map(async (entry) => ({
      ...entry,
      missing: !(await fs.stat(entry.path).then((s) => s.isFile()).catch(() => false)),
    })));
    return {projects, fault: this.fault};
  }

  /** Records a file the user opened, created or saved. Re-recording moves it to the top. */
  async remember(target: string, name?: string): Promise<ProjectReference> {
    const entries = await this.load();
    const existing = entries.find((e) => sameFile(e.path, target));
    const entry: ProjectReference = {
      id: existing?.id ?? randomUUID(),
      path: target,
      name: name ?? path.basename(target),
      openedAt: new Date().toISOString(),
    };
    this.entries = [entry, ...entries.filter((e) => !sameFile(e.path, target))].slice(0, MAX_ENTRIES);
    await this.persist();
    return entry;
  }

  /** Drops the reference. The file itself is deliberately left on disk. */
  async forget(id: string): Promise<boolean> {
    const entries = await this.load();
    const next = entries.filter((e) => e.id !== id);
    if (next.length === entries.length) return false;
    this.entries = next;
    await this.persist();
    return true;
  }

  /** Points an existing entry at a file the user reselected after it moved. */
  async relocate(id: string, target: string): Promise<ProjectReference | null> {
    const entries = await this.load();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return null;
    const moved: ProjectReference = {...entry, path: target, name: path.basename(target),
      openedAt: new Date().toISOString()};
    // Reselecting onto a file already listed elsewhere must not create a duplicate.
    this.entries = [moved, ...entries.filter((e) => e.id !== id && !sameFile(e.path, target))]
      .slice(0, MAX_ENTRIES);
    await this.persist();
    return moved;
  }

  async find(id: string): Promise<ProjectReference | null> {
    return (await this.load()).find((e) => e.id === id) ?? null;
  }
}
