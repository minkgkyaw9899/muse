import { createRequire } from 'node:module';
import type { DatabaseSync as NodeDatabase, SQLInputValue } from 'node:sqlite';
import {
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
    database.exec('PRAGMA user_version = 3');
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
