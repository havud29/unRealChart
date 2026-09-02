import type { Playlist, Song } from '@unrealchart/ireal-format';
import { parsePlaylist } from '@unrealchart/ireal-format';

/**
 * The library, kept on the device.
 *
 * Two rules shape this. First, store the *original payload* beside anything
 * derived: when the parser improves, a reparse from source is a one-line
 * migration, where migrating parsed data is a project. Second, deduplicate on
 * the chord payload rather than the title — the same tune arrives a dozen times
 * with different spellings, and silently dropping one of them is worse than
 * keeping both.
 */

const DB_NAME = 'unrealchart';
const DB_VERSION = 1;
const SONGS = 'songs';
const SETTINGS = 'settings';

export interface StoredSong {
  /** Content hash of the payload — stable across titles and re-imports. */
  id: string;
  title: string;
  composer: string;
  style: string;
  key: string;
  /** The URI this song came from, so it can be reparsed or re-exported. */
  uri: string;
  playlist: string | null;
  importedAt: number;
}

/**
 * The database this app used to be called.
 *
 * Renaming the project renamed the store, and a store nobody reads is a
 * library the user lost -- including any chart they wrote themselves, which
 * exists nowhere else. The old database is copied across once, on the first
 * open of an empty new one, and then left alone rather than deleted: a rename
 * is not a good enough reason to destroy the only copy of someone's work.
 */
const LEGACY_DB_NAME = 'ifakepro';

function openNamed(name: string, upgrade: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const request = upgrade ? indexedDB.open(name, DB_VERSION) : indexedDB.open(name);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!upgrade) return;
      if (!db.objectStoreNames.contains(SONGS)) {
        const store = db.createObjectStore(SONGS, { keyPath: 'id' });
        store.createIndex('playlist', 'playlist');
        store.createIndex('title', 'title');
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) return resolve([]);
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => resolve([]);
  });
}

/** Copy the old library over, if there is one and the new store is empty. */
async function migrateLegacy(db: IDBDatabase): Promise<void> {
  const held = await new Promise<number>((resolve) => {
    const request = db.transaction(SONGS, 'readonly').objectStore(SONGS).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(-1);
  });
  if (held !== 0) return;

  // Opening without a version will not create a database that is not there:
  // an absent one arrives with no object stores, and there is nothing to move.
  const legacy = await openNamed(LEGACY_DB_NAME, false);
  if (!legacy) return;
  try {
    const songs = (await readAll(legacy, SONGS)) as StoredSong[];
    if (songs.length === 0) return;
    const tx = db.transaction(SONGS, 'readwrite');
    const store = tx.objectStore(SONGS);
    for (const song of songs) store.put(song);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    console.info(`[unrealchart] moved ${songs.length} songs from the previous library`);
  } finally {
    legacy.close();
  }
}

async function open(): Promise<IDBDatabase> {
  const db = await openNamed(DB_NAME, true);
  if (!db) throw new Error('could not open the library');
  await migrateLegacy(db);
  return db;
}

function run<T>(store: IDBObjectStore, request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    void store; // keep the transaction alive until the request settles
  });
}

/** A stable id for a song: FNV-1a over the payload it was written from. */
export function songId(song: Song): string {
  const source = song.raw || song.music;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36) + source.length.toString(36);
}

/**
 * The URI for a stored song.
 *
 * Built from the record the song was parsed from, never from its parsed fields:
 * a two-word composer is stored last name first, so re-encoding the display
 * name and reading it back would reverse "Otis Rush" into "Rush Otis" on every
 * round trip.
 */
export function songUri(song: Song, scheme: 'irealb' | 'irealbook'): string {
  return `${scheme}://${encodeURIComponent(song.record)}`;
}

export interface LibraryEntry {
  id: string;
  song: Song;
  /** The playlist the song was imported from, which is its source in the sidebar. */
  playlist: string | null;
}

export interface LibraryStore {
  add(playlist: Playlist): Promise<number>;
  all(): Promise<LibraryEntry[]>;
  /** Overwrite one song, keeping its identity across an edit. */
  save(
    id: string,
    song: Song,
    scheme: 'irealb' | 'irealbook',
    playlist?: string | null,
  ): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
  setSetting(key: string, value: unknown): Promise<void>;
  getSetting<T>(key: string): Promise<T | undefined>;
}

/**
 * Storage can be unavailable — a private window, blocked site data, an old
 * browser. That is a reason to run without persistence, never a reason to
 * refuse to start, so every call degrades to a no-op.
 */
export function createLibrary(): LibraryStore {
  let db: Promise<IDBDatabase> | null = null;
  const database = () => (db ??= open());

  const safely = async <T>(work: (db: IDBDatabase) => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work(await database());
    } catch (error) {
      console.warn('[unrealchart] library storage unavailable:', error);
      return fallback;
    }
  };

  return {
    async add(playlist) {
      return safely(async (handle) => {
        const tx = handle.transaction(SONGS, 'readwrite');
        const store = tx.objectStore(SONGS);
        let added = 0;
        for (const song of playlist.songs) {
          const record: StoredSong = {
            id: songId(song),
            title: song.title,
            composer: song.composer,
            style: song.style,
            key: song.key,
            uri: songUri(song, playlist.scheme),
            playlist: playlist.name,
            importedAt: Date.now(),
          };
          store.put(record); // put, so re-importing updates rather than duplicating
          added++;
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return added;
      }, 0);
    },

    async all() {
      return safely(async (handle) => {
        const tx = handle.transaction(SONGS, 'readonly');
        const store = tx.objectStore(SONGS);
        const records = await run(store, store.getAll() as IDBRequest<StoredSong[]>);
        // Reparse from the stored URI, so a parser improvement reaches old
        // imports without a migration.
        return records
          .sort((a, b) => a.title.localeCompare(b.title))
          .flatMap((record) => {
            try {
              return parsePlaylist(record.uri).songs.map((song) => ({
                id: record.id,
                song,
                playlist: record.playlist,
              }));
            } catch (error) {
              // A stored song that will not reparse is a bug in whatever wrote
              // it -- most likely a URI whose scheme does not match how its
              // record is encoded. Dropping it silently hides that; say so.
              console.warn(
                `[unrealchart] dropping unreadable song ${record.id} (${record.title}):`,
                error,
              );
              return [];
            }
          });
      }, []);
    },

    async save(id, song, scheme, playlist = null) {
      await safely(async (handle) => {
        const tx = handle.transaction(SONGS, 'readwrite');
        const record: StoredSong = {
          // The id is deliberately the one the song already had: an edit
          // changes the payload, so a content hash would file the result as a
          // second, unrelated song.
          id,
          title: song.title,
          composer: song.composer,
          style: song.style,
          key: song.key,
          uri: songUri(song, scheme),
          // Keep the song where it lives: an edit must not move it out of the
          // playlist it was imported into.
          playlist,
          importedAt: Date.now(),
        };
        tx.objectStore(SONGS).put(record);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }, undefined);
    },

    async clear() {
      await safely(async (handle) => {
        const tx = handle.transaction(SONGS, 'readwrite');
        tx.objectStore(SONGS).clear();
        await new Promise<void>((resolve) => {
          tx.oncomplete = () => resolve();
        });
      }, undefined);
    },

    async count() {
      return safely(async (handle) => {
        const tx = handle.transaction(SONGS, 'readonly');
        const store = tx.objectStore(SONGS);
        return run(store, store.count());
      }, 0);
    },

    async setSetting(key, value) {
      await safely(async (handle) => {
        const tx = handle.transaction(SETTINGS, 'readwrite');
        tx.objectStore(SETTINGS).put(value, key);
        await new Promise<void>((resolve) => {
          tx.oncomplete = () => resolve();
        });
      }, undefined);
    },

    async getSetting<T>(key: string) {
      return safely(async (handle) => {
        const tx = handle.transaction(SETTINGS, 'readonly');
        const store = tx.objectStore(SETTINGS);
        return (await run(store, store.get(key))) as T | undefined;
      }, undefined);
    },
  };
}
