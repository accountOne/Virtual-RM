import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SEED_DIR = path.join(__dirname, '..', '..', 'data-seed');

/**
 * Isolates all JSON file access for a single collection file (e.g. data/tasks.json).
 * Controllers/services must never touch the filesystem directly — everything
 * goes through a repository, so swapping this for a real Banking API repository
 * later only means implementing the same read/write methods.
 */
export class JsonFileRepository<T extends { id?: string }> {
  private readonly filePath: string;
  private readonly seedPath: string;

  constructor(private readonly fileName: string) {
    this.filePath = path.join(DATA_DIR, fileName);
    this.seedPath = path.join(SEED_DIR, fileName);
  }

  readAll(): T[] {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw) as T[];
  }

  writeAll(items: T[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2) + '\n', 'utf-8');
  }

  findById(id: string): T | undefined {
    return this.readAll().find((item) => item.id === id);
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const items = this.readAll();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return undefined;
    items[index] = { ...items[index], ...patch };
    this.writeAll(items);
    return items[index];
  }

  replaceAll(items: T[]): T[] {
    this.writeAll(items);
    return items;
  }

  delete(id: string): boolean {
    const items = this.readAll();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    this.writeAll(next);
    return true;
  }

  reset(): void {
    const seedRaw = fs.readFileSync(this.seedPath, 'utf-8');
    fs.writeFileSync(this.filePath, seedRaw, 'utf-8');
  }
}

/** Repository for a single-object JSON file (e.g. data/customer.json). */
export class JsonSingletonRepository<T> {
  private readonly filePath: string;
  private readonly seedPath: string;

  constructor(private readonly fileName: string) {
    this.filePath = path.join(DATA_DIR, fileName);
    this.seedPath = path.join(SEED_DIR, fileName);
  }

  read(): T {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  write(data: T): T {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return data;
  }

  update(patch: Partial<T>): T {
    const current = this.read();
    const next = { ...current, ...patch };
    this.write(next);
    return next;
  }

  reset(): void {
    const seedRaw = fs.readFileSync(this.seedPath, 'utf-8');
    fs.writeFileSync(this.filePath, seedRaw, 'utf-8');
  }
}
