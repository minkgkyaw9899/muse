import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { createMupdfDocumentRenderer } from '@/features/reader/mupdf-document-renderer';
import { loadNativePublicationImport } from '../../../modules/publication-import/src/PublicationImportModule';
import {
  copyNativePublicationSource,
  createNativePublicationPicker,
  NATIVE_PUBLICATION_SOURCE_PREFIX,
} from './native-publication-import';
import {
  createPublicationLibrary,
  LibraryAdapterError,
  MAX_IMPORT_BYTES,
  type PickedPublication,
  type Publication,
  type PublicationLibrary,
  type PublicationLibraryDependencies,
} from './publication-library';

const COPY_CHUNK_BYTES = 256 * 1024;
const STAGING = 'staging';
const PUBLICATIONS = 'publications';

function ownedDirectory(name: string): Directory {
  const directory = new Directory(Paths.document, name);
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function ownedFile(relativePath: string): File {
  const [directoryName, fileName, ...extra] = relativePath.split('/');
  if (
    !directoryName ||
    !fileName ||
    extra.length > 0 ||
    ![STAGING, PUBLICATIONS].includes(directoryName) ||
    !/^[a-zA-Z0-9_-]+\.pdf$/.test(fileName)
  ) {
    throw new LibraryAdapterError('storage');
  }
  return new File(ownedDirectory(directoryName), fileName);
}

async function removeIfPresent(relativePath: string): Promise<void> {
  const file = ownedFile(relativePath);
  if (file.exists) file.delete();
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LibraryAdapterError('cancelled');
}

function pickerCacheFile(uri: string): File | null {
  const cachePrefix = `${new Directory(Paths.cache, 'DocumentPicker').uri.replace(/\/$/, '')}/`;
  return uri.startsWith(cachePrefix) ? new File(uri) : null;
}

export function createExpoPublicationPicker(): PublicationLibraryDependencies['picker'] {
  if (Platform.OS === 'ios') {
    const native = loadNativePublicationImport();
    if (native) return createNativePublicationPicker(native);
    const unavailable = async (): Promise<never> => {
      throw new LibraryAdapterError('unavailable');
    };
    return { pickOne: unavailable, pickMany: unavailable };
  }
  async function pick(multiple: boolean): Promise<PickedPublication[]> {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple,
        copyToCacheDirectory: false,
        base64: false,
      });
    } catch {
      throw new LibraryAdapterError('permissionDenied');
    }
    if (result.canceled) return [];
    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      async dispose() {
        const copied = pickerCacheFile(asset.uri);
        if (copied?.exists) copied.delete();
      },
    }));
  }
  return {
    pickOne: async () => (await pick(false))[0] ?? null,
    pickMany: () => pick(true),
  };
}

export function createExpoPublicationFileStore(): PublicationLibraryDependencies['fileStore'] {
  return {
    async stage(source, operationId, signal) {
      if (!/^[a-zA-Z0-9_-]+$/.test(operationId)) throw new LibraryAdapterError('storage');
      throwIfCancelled(signal);
      if (source.uri.startsWith(NATIVE_PUBLICATION_SOURCE_PREFIX)) {
        const native = loadNativePublicationImport();
        if (!native) throw new LibraryAdapterError('unavailable');
        return copyNativePublicationSource(native, source, operationId, signal);
      }
      const relativePath = `${STAGING}/${operationId}.pdf`;
      const staged = ownedFile(relativePath);
      const input = new File(source.uri);
      let reader: ReturnType<File['open']> | null = null;
      let writer: ReturnType<File['open']> | null = null;
      let byteSize = 0;
      let completed = false;
      let created = false;
      let failure: LibraryAdapterError | null = null;
      try {
        if (!input.exists) throw new LibraryAdapterError('permissionDenied');
        const inputSize = input.info().size;
        if (inputSize !== undefined && inputSize > MAX_IMPORT_BYTES)
          throw new LibraryAdapterError('resourceLimit');
        staged.create();
        created = true;
        reader = input.open(FileMode.ReadOnly);
        writer = staged.open(FileMode.WriteOnly);
        while (true) {
          throwIfCancelled(signal);
          const bytes = reader.readBytes(COPY_CHUNK_BYTES);
          if (bytes.length === 0) break;
          byteSize += bytes.length;
          if (byteSize > MAX_IMPORT_BYTES) throw new LibraryAdapterError('resourceLimit');
          writer.writeBytes(bytes);
          // Yield each chunk for navigation/cancellation and lower measured peak memory.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        completed = true;
      } catch (error) {
        failure = error instanceof LibraryAdapterError ? error : new LibraryAdapterError('storage');
      }
      let closeFailed = false;
      try {
        reader?.close();
      } catch {
        closeFailed = true;
      }
      try {
        writer?.close();
      } catch {
        closeFailed = true;
      }
      if (created && (!completed || closeFailed)) await removeIfPresent(relativePath);
      if (failure || closeFailed) throw failure ?? new LibraryAdapterError('storage');
      return { uri: staged.uri, relativePath, byteSize };
    },
    async promote(staged, publicationId) {
      if (!/^[a-zA-Z0-9_-]+$/.test(publicationId)) throw new LibraryAdapterError('storage');
      const destination = ownedFile(`${PUBLICATIONS}/${publicationId}.pdf`);
      if (destination.exists) throw new LibraryAdapterError('storage');
      const source = ownedFile(staged.relativePath);
      try {
        await source.move(destination);
        return {
          uri: destination.uri,
          relativePath: `${PUBLICATIONS}/${publicationId}.pdf`,
          byteSize: staged.byteSize,
        };
      } catch {
        if (destination.exists) {
          try {
            destination.delete();
          } catch {
            // Startup reconciliation will retry a failed cleanup.
          }
        }
        throw new LibraryAdapterError('storage');
      }
    },
    remove: removeIfPresent,
    async reconcile(referencedPaths) {
      const keep = new Set(referencedPaths);
      for (const name of [STAGING, PUBLICATIONS]) {
        const directory = ownedDirectory(name);
        for (const entry of directory.list()) {
          if (!(entry instanceof File)) continue;
          const relativePath = `${name}/${entry.name}`;
          if (name === STAGING || !keep.has(relativePath)) entry.delete();
        }
      }
      const pickerCache = new Directory(Paths.cache, 'DocumentPicker');
      if (pickerCache.exists) {
        for (const entry of pickerCache.list()) if (entry instanceof File) entry.delete();
      }
    },
  };
}

type PublicationRow = {
  id: string;
  title: string;
  source_filename: string;
  byte_size: number;
  page_count: number;
  fingerprint: string;
  imported_at: string;
  last_opened_at: string | null;
  reading_position_page: number | null;
  owned_path: string;
};

function toPublication(row: PublicationRow): Publication {
  return {
    id: row.id,
    title: row.title,
    sourceFilename: row.source_filename,
    byteSize: row.byte_size,
    pageCount: row.page_count,
    fingerprint: row.fingerprint,
    importedAt: row.imported_at,
    lastOpenedAt: row.last_opened_at,
    readingPosition: null,
    ownedPath: row.owned_path,
  };
}

export function createSQLitePublicationRepository(): PublicationLibraryDependencies['repository'] {
  let database: Promise<SQLite.SQLiteDatabase> | null = null;
  async function db() {
    database ??= SQLite.openDatabaseAsync('muse-library.db');
    return database;
  }
  return {
    async initialize() {
      const database = await db();
      await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((version?.user_version ?? 0) > 1) throw new LibraryAdapterError('storage');
      if ((version?.user_version ?? 0) === 0) {
        await database.withExclusiveTransactionAsync(async (transaction) => {
          await transaction.execAsync(`
            CREATE TABLE IF NOT EXISTS publications (
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
        });
      }
    },
    async list() {
      const rows = await (await db()).getAllAsync<PublicationRow>(
        'SELECT * FROM publications ORDER BY imported_at DESC, id ASC',
      );
      return rows.map(toPublication);
    },
    async findByFingerprint(fingerprint) {
      const row = await (await db()).getFirstAsync<PublicationRow>(
        'SELECT * FROM publications WHERE fingerprint = ?',
        fingerprint,
      );
      return row ? toPublication(row) : null;
    },
    async insert(publication) {
      const database = await db();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO publications (id, title, source_filename, byte_size, page_count, fingerprint,
            imported_at, last_opened_at, reading_position_page, owned_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          publication.id,
          publication.title,
          publication.sourceFilename,
          publication.byteSize,
          publication.pageCount,
          publication.fingerprint,
          publication.importedAt,
          publication.lastOpenedAt,
          null,
          publication.ownedPath,
        );
      });
    },
  };
}

function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/** The app's production Library. Kept lazy so screens and tests can inject another adapter. */
export function createExpoPublicationLibrary(): PublicationLibrary {
  return createPublicationLibrary({
    picker: createExpoPublicationPicker(),
    fileStore: createExpoPublicationFileStore(),
    repository: createSQLitePublicationRepository(),
    renderer: createMupdfDocumentRenderer(),
    clock: { now: () => new Date() },
    ids: { next: nextId },
  });
}
