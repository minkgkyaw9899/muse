import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { DatabaseSync as NodeDatabase, SQLInputValue } from 'node:sqlite';
import {
  createExpoPublicationFileStore,
  createSQLitePublicationRepository,
  type SQLitePublicationDatabase,
} from '@/features/library/expo-publication-adapters';
import {
  createPublicationLibrary,
  type PublicationLibraryDependencies,
} from '@/features/library/publication-library';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: () => {
    throw new Error('Expected an injected SQLite connection');
  },
}));

// A filesystem adapter backed by host files; production ownership/cleanup code still runs.
jest.mock('expo-file-system', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = fs.mkdtempSync('/tmp/muse-publication-actions-');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path.join(...parts.map((part) => (typeof part === 'string' ? part : part.uri)));
    }
    get exists() {
      return fs.existsSync(this.uri);
    }
    get name() {
      return path.basename(this.uri);
    }
    delete() {
      fs.unlinkSync(this.uri);
    }
  }
  class Directory extends File {
    create() {
      fs.mkdirSync(this.uri, { recursive: true });
    }
    list() {
      return fs
        .readdirSync(this.uri, { withFileTypes: true })
        .map((entry: { name: string; isDirectory(): boolean }) =>
          entry.isDirectory()
            ? new Directory(this.uri, entry.name)
            : new File(this.uri, entry.name),
        );
    }
    delete() {
      fs.rmSync(this.uri, { recursive: true });
    }
  }
  return {
    File,
    Directory,
    Paths: { document: path.join(root, 'documents'), cache: path.join(root, 'cache') },
  };
});

const hostPaths = jest.requireMock('expo-file-system').Paths as { document: string; cache: string };
afterAll(() => {
  rmSync(join(hostPaths.document, '..'), { recursive: true, force: true });
});

// Use the host SQLite engine rather than mocking SQL. createRequire bypasses Jest's
// resolver, which predates Node's built-in SQLite module.
const { DatabaseSync } = createRequire(`${process.cwd()}/package.json`)('node:sqlite') as {
  DatabaseSync: new (path: string) => NodeDatabase;
};

function sqliteConnection(database: NodeDatabase): SQLitePublicationDatabase {
  const bind = (values: readonly unknown[]) =>
    values.map((value) => (typeof value === 'boolean' ? Number(value) : value)) as SQLInputValue[];
  const connection: SQLitePublicationDatabase = {
    execAsync: async (sql) => {
      database.exec(sql);
    },
    getFirstAsync: async <T>(sql: string, ...values: unknown[]) =>
      (database.prepare(sql).get(...bind(values)) as T | undefined) ?? null,
    getAllAsync: async <T>(sql: string, ...values: unknown[]) =>
      database.prepare(sql).all(...bind(values)) as T[],
    runAsync: async (sql, ...values) => database.prepare(sql).run(...bind(values)),
    async withExclusiveTransactionAsync(task) {
      database.exec('BEGIN IMMEDIATE');
      try {
        await task(connection);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return connection;
}

function libraryFor(
  database: NodeDatabase,
  connection = sqliteConnection(database),
  openDatabase = async () => connection,
  removePublication: PublicationLibraryDependencies['fileStore']['removePublication'] = async () => {},
) {
  const repository = createSQLitePublicationRepository(openDatabase);
  const dependencies: PublicationLibraryDependencies = {
    repository,
    picker: {
      pickOne: async () => ({
        uri: 'provider://notes',
        name: 'New Notes.pdf',
        dispose: async () => {},
      }),
      pickMany: async () => [],
    },
    fileStore: {
      stage: async () => ({
        uri: 'file:///staged',
        relativePath: 'staging/new.pdf',
        byteSize: 2048,
      }),
      promote: async () => ({ uri: 'file:///owned', relativePath: 'publications/new.pdf' }),
      remove: async () => {},
      removePublication,
      reconcile: async () => {},
    },
    renderer: {
      inspect: async () => ({
        ok: true,
        inspection: { pageCount: 3, fingerprint: 'b'.repeat(64) },
      }),
      cancel: () => {},
    },
    clock: { now: () => new Date('2026-10-02T02:00:00.000Z') },
    ids: { next: () => 'new' },
  };
  return createPublicationLibrary(dependencies);
}

function seedSchemaOne(database: NodeDatabase): void {
  database.exec(`
    CREATE TABLE publications (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      fingerprint TEXT NOT NULL UNIQUE,
      imported_at TEXT NOT NULL,
      last_opened_at TEXT,
      reading_position_page INTEGER,
      owned_path TEXT NOT NULL UNIQUE
    );
    PRAGMA user_version = 1;
  `);
  database
    .prepare('INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      'original',
      'Field Notes',
      'Field Notes.pdf',
      1024,
      2,
      'a'.repeat(64),
      '2026-09-30T02:00:00.000Z',
      '2026-10-01T03:00:00.000Z',
      null,
      'publications/original.pdf',
    );
}

it('upgrades schema-1 publications with a default-false favorite and preserves durable metadata', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const library = libraryFor(database);
    const original = {
      id: 'original',
      title: 'Field Notes',
      sourceFilename: 'Field Notes.pdf',
      byteSize: 1024,
      pageCount: 2,
      fingerprint: 'a'.repeat(64),
      importedAt: '2026-09-30T02:00:00.000Z',
      lastOpenedAt: '2026-10-01T03:00:00.000Z',
      readingPosition: null,
      ownedPath: 'publications/original.pdf',
      isFavorite: false,
    };
    await expect(library.list()).resolves.toEqual([original]);
    await expect(library.setFavorite('original', true)).resolves.toEqual({
      status: 'saved',
      publication: { ...original, isFavorite: true },
    });
    await expect(libraryFor(database).list()).resolves.toEqual([{ ...original, isFavorite: true }]);
  } finally {
    database.close();
  }
});

it('persists favorite and unfavorite choices from a fresh database without duplicating publications', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const library = libraryFor(database);
    const imported = await library.importOne();
    expect(imported).toMatchObject({ status: 'imported', publication: { isFavorite: false } });
    await expect(library.setFavorite('new', true)).resolves.toMatchObject({
      status: 'saved',
      publication: { isFavorite: true },
    });
    const relaunched = libraryFor(database);
    await expect(relaunched.importOne()).resolves.toMatchObject({
      status: 'duplicate',
      publication: { id: 'new', isFavorite: true },
    });
    await expect(relaunched.setFavorite('new', false)).resolves.toMatchObject({
      status: 'saved',
      publication: { isFavorite: false },
    });
    await expect(libraryFor(database).list()).resolves.toEqual([
      expect.objectContaining({ id: 'new', isFavorite: false }),
    ]);
    await expect(relaunched.setFavorite("unknown' OR 1=1 --", true)).resolves.toMatchObject({
      status: 'error',
      error: { category: 'notFound' },
    });
    await expect(relaunched.list()).resolves.toEqual([
      expect.objectContaining({ id: 'new', isFavorite: false }),
    ]);
  } finally {
    database.close();
  }
});

it('rolls back an interrupted migration so a later launch can safely upgrade the same Library', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const connection = sqliteConnection(database);
    const interrupted: SQLitePublicationDatabase = {
      ...connection,
      withExclusiveTransactionAsync: (task) =>
        connection.withExclusiveTransactionAsync(async (transaction) => {
          await task(transaction);
          throw new Error('Storage connection interrupted before commit');
        }),
    };
    await expect(libraryFor(database, interrupted).list()).rejects.toThrow(
      'Storage connection interrupted before commit',
    );
    const recovered = libraryFor(database);
    await expect(recovered.list()).resolves.toEqual([
      expect.objectContaining({ id: 'original', title: 'Field Notes', isFavorite: false }),
    ]);
    await expect(recovered.setFavorite('original', true)).resolves.toMatchObject({
      status: 'saved',
    });
  } finally {
    database.close();
  }
});

it('rejects a newer unsupported Library schema with safe favorite recovery guidance', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA user_version = 4');
    const library = libraryFor(database);
    await expect(library.setFavorite('original', true)).resolves.toEqual({
      status: 'error',
      error: {
        category: 'storage',
        message: 'Muse could not save this favorite. Please try again.',
      },
    });
    await expect(library.list()).rejects.toMatchObject({ category: 'storage' });
  } finally {
    database.close();
  }
});

it('lets a reader retry a favorite after a transient Library initialization failure', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const connection = sqliteConnection(database);
    let available = false;
    const recovering: SQLitePublicationDatabase = {
      ...connection,
      async execAsync(sql) {
        if (!available) {
          available = true;
          throw new Error('Storage temporarily unavailable');
        }
        await connection.execAsync(sql);
      },
    };
    const library = libraryFor(database, recovering);
    await expect(library.setFavorite('original', true)).resolves.toMatchObject({
      status: 'error',
      error: { category: 'storage' },
    });
    await expect(library.setFavorite('original', true)).resolves.toMatchObject({
      status: 'saved',
      publication: { id: 'original', isFavorite: true },
    });
    await expect(libraryFor(database).list()).resolves.toEqual([
      expect.objectContaining({ id: 'original', isFavorite: true }),
    ]);
  } finally {
    database.close();
  }
});

it('reopens storage when a reader retries loading after a failed connection attempt', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const connection = sqliteConnection(database);
    let available = false;
    const library = libraryFor(database, connection, async () => {
      if (!available) {
        available = true;
        throw new Error('Storage temporarily unavailable');
      }
      return connection;
    });
    await expect(library.list()).rejects.toThrow('Storage temporarily unavailable');
    await expect(library.list()).resolves.toEqual([
      expect.objectContaining({ id: 'original', title: 'Field Notes', isFavorite: false }),
    ]);
    await expect(library.setFavorite('original', true)).resolves.toMatchObject({
      status: 'saved',
      publication: { id: 'original', isFavorite: true },
    });
  } finally {
    database.close();
  }
});

it('persists renamed metadata and resumes an interrupted removal without removing another publication', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const connection = sqliteConnection(database);
    let interrupted = true;
    const remainingFiles = new Set(['publications/original.pdf', 'publications/new.pdf']);
    const remainingCaches = new Set(['original', 'new']);
    const cleanup: PublicationLibraryDependencies['fileStore']['removePublication'] = async ({
      id,
      ownedPath,
    }) => {
      if (interrupted) throw new Error('interrupted cleanup');
      remainingFiles.delete(ownedPath);
      remainingCaches.delete(id);
    };
    const library = libraryFor(database, connection, async () => connection, cleanup);
    await library.importOne();
    await expect(library.rename('original', "Reader's revised notes")).resolves.toMatchObject({
      status: 'saved',
    });
    await expect(libraryFor(database).list()).resolves.toContainEqual(
      expect.objectContaining({
        id: 'original',
        title: "Reader's revised notes",
        ownedPath: 'publications/original.pdf',
        sourceFilename: 'Field Notes.pdf',
      }),
    );
    await expect(library.remove('original')).resolves.toEqual({
      status: 'removed',
      cleanupPending: true,
    });
    expect(await library.list()).toEqual([expect.objectContaining({ id: 'new' })]);
    interrupted = false;
    expect(await libraryFor(database, connection, async () => connection, cleanup).list()).toEqual([
      expect.objectContaining({ id: 'new' }),
    ]);
    expect(remainingFiles).toEqual(new Set(['publications/new.pdf']));
    expect(remainingCaches).toEqual(new Set(['new']));
  } finally {
    database.close();
  }
});

it('migrates schema-2 favorites to recoverable removal without losing metadata', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    database.exec(
      'ALTER TABLE publications ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0; UPDATE publications SET is_favorite = 1; PRAGMA user_version = 2;',
    );
    const library = libraryFor(database);
    expect(await library.list()).toEqual([
      expect.objectContaining({ title: 'Field Notes', isFavorite: true }),
    ]);
    await expect(library.remove('original')).resolves.toEqual({
      status: 'removed',
      cleanupPending: false,
    });
    expect(await libraryFor(database).list()).toEqual([]);
  } finally {
    database.close();
  }
});

it('rolls back failed removal before deleting source files or exposing a change', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const cleanup = jest.fn(async () => {});
    const connection = sqliteConnection(database);
    const library = libraryFor(database, connection, async () => connection, cleanup);
    await library.list();
    database.exec(
      "CREATE TRIGGER reject_remove BEFORE DELETE ON publications BEGIN SELECT RAISE(ABORT, 'private source'); END;",
    );
    await expect(library.remove('original')).resolves.toMatchObject({
      status: 'error',
      error: { category: 'storage' },
    });
    expect(await library.list()).toEqual([expect.objectContaining({ id: 'original' })]);
    expect(cleanup).not.toHaveBeenCalled();
    expect(await libraryFor(database).list()).toEqual([
      expect.objectContaining({ id: 'original' }),
    ]);
  } finally {
    database.close();
  }
});

it('deletes the selected owned source and nested renditions while preserving other files through the production file adapter', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const connection = sqliteConnection(database);
    const library = libraryFor(
      database,
      connection,
      async () => connection,
      createExpoPublicationFileStore().removePublication,
    );
    await library.importOne();
    for (const id of ['original', 'new']) {
      mkdirSync(join(hostPaths.document, 'publications'), { recursive: true });
      writeFileSync(join(hostPaths.document, 'publications', `${id}.pdf`), 'owned fixture');
      mkdirSync(join(hostPaths.cache, 'renditions', id, 'tiles'), { recursive: true });
      writeFileSync(join(hostPaths.cache, 'renditions', id, 'tiles', 'page.png'), 'cached fixture');
    }
    await expect(library.remove('original')).resolves.toEqual({
      status: 'removed',
      cleanupPending: false,
    });
    expect(existsSync(join(hostPaths.document, 'publications', 'original.pdf'))).toBe(false);
    expect(existsSync(join(hostPaths.cache, 'renditions', 'original'))).toBe(false);
    expect(existsSync(join(hostPaths.document, 'publications', 'new.pdf'))).toBe(true);
    expect(existsSync(join(hostPaths.cache, 'renditions', 'new', 'tiles', 'page.png'))).toBe(true);
    expect(await library.list()).toEqual([expect.objectContaining({ id: 'new' })]);
  } finally {
    database.close();
  }
});

it('keeps the committed favorite when SQLite rejects an update and emits no change', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    seedSchemaOne(database);
    const library = libraryFor(database);
    await library.setFavorite('original', true);
    database.exec(`
      CREATE TRIGGER reject_favorite BEFORE UPDATE OF is_favorite ON publications
        BEGIN SELECT RAISE(ABORT, 'private publication file:///reader/Notes.pdf'); END;
    `);
    const changed = jest.fn();
    library.subscribe(changed);
    await expect(library.setFavorite('original', false)).resolves.toEqual({
      status: 'error',
      error: {
        category: 'storage',
        message: 'Muse could not save this favorite. Please try again.',
      },
    });
    await expect(libraryFor(database).list()).resolves.toEqual([
      expect.objectContaining({ id: 'original', isFavorite: true }),
    ]);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    database.close();
  }
});
