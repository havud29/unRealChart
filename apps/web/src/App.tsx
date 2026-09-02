import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { parsePlaylist, replaceMusic, scramble, toHtml } from '@ifakepro/ireal-format';
import type { Playlist, Song } from '@ifakepro/ireal-format';
import {
  INSTRUMENT_OFFSETS,
  buildSongModel,
  buildTimemap,
  toMusicXml,
  totalDuration,
  transposeModel,
  unroll,
} from '@ifakepro/song-model';
import type { InstrumentKey } from '@ifakepro/song-model';
import { PACKS, toMidiFile } from '@ifakepro/groove-engine';
import { Chart } from './Chart.js';
import { DEFAULT_SETTINGS, usePlayer } from './usePlayer.js';
import type { PlayerSettings } from './usePlayer.js';
import { createLibrary } from './storage.js';
import type { LibraryEntry } from './storage.js';
import { DEFAULT_LIBRARY, SEED_SETTING, fetchDefaultLibrary } from './defaultLibrary.js';
import { NEW_CHART_TITLE, blankSong } from './newChart.js';
import { Editor } from './Editor.js';
import { Diagrams } from './Diagrams.js';
import { useServiceWorker, useWakeLock } from './useServiceWorker.js';

/**
 * A self-authored demo chart, so the app shows something before anything is
 * imported. Chord progressions carry no copyright.
 */
const DEMO_MUSIC =
  '*A[T44F7   |Bb7   |F7   |F7   |Bb7   |Bb7   |F7   |F7   |G-7   |C7   |F7   |C7   Z';

const DEMO_URI = `irealb://${encodeURIComponent(
  [
    'Blues in F',
    // Single word on purpose: a two-word composer is stored last-name-first and
    // would come back reversed, which is correct but looks like a bug in a demo.
    'iFakePro',
    '',
    'Medium Swing',
    'F',
    '0',
    `1r34LbKcu7${scramble(DEMO_MUSIC)}`,
    'Medium Swing',
    '160',
    '3',
  ].join('=') + '===Demo',
)}`;

const HORN_KEYS: InstrumentKey[] = ['C', 'Bb', 'Eb', 'F'];

/** The twelve roots, spelled the way iReal Pro's key menu spells them. */
const KEY_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class of a key name like `Bb` or `F-`, ignoring its tonality. */
function keyPitch(key: string): number {
  const match = /^([A-G])([b#]?)/.exec(key.trim());
  if (!match) return 0;
  const base = PITCH[match[1]!]!;
  const shift = match[2] === 'b' ? -1 : match[2] === '#' ? 1 : 0;
  return (((base + shift) % 12) + 12) % 12;
}

/** Hand the user a file. Everything stays on their device. */
function download(name: string, content: string | Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Strip anything a filesystem will object to. */
function safeFileName(name: string): string {
  return name.replace(/[^\w\-. ]+/g, '').trim() || 'chart';
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * A fader that shows its level.
 *
 * A bare range control gives you a thumb on an empty rail, which tells you
 * where the handle is but not how loud the piano is. Filling the track up to
 * the thumb is the whole difference between a form field and a mixer.
 */
function Fader({
  value,
  max = 100,
  onChange,
  label,
  className,
}: {
  value: number;
  max?: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={0}
      max={max}
      value={value}
      className={className}
      style={{ '--fill': `${(value / max) * 100}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
    />
  );
}

/** A stepper: a big value with up and down arrows, the way the Mac app draws it. */
function Stepper({
  value,
  caption,
  onStep,
  onClick,
}: {
  value: string;
  caption: string;
  onStep?: (delta: number) => void;
  onClick?: () => void;
}) {
  return (
    <div className="stepper">
      <div className="stepper-row">
        <button
          type="button"
          className="stepper-value"
          onClick={onClick}
          disabled={!onClick}
          title={caption}
        >
          {value}
        </button>
        {onStep ? (
          <span className="stepper-arrows">
            <button type="button" onClick={() => onStep(1)} aria-label={`${caption} up`}>
              ⌃
            </button>
            <button type="button" onClick={() => onStep(-1)} aria-label={`${caption} down`}>
              ⌄
            </button>
          </span>
        ) : null}
      </div>
      <span className="stepper-caption">{caption}</span>
    </div>
  );
}

export function App() {
  const library = useRef(createLibrary()).current;

  const [entries, setEntries] = useState<LibraryEntry[]>(() =>
    parsePlaylist(DEMO_URI).songs.map((song, i) => ({
      id: `demo-${i}`,
      song,
      playlist: null,
    })),
  );
  const [scheme, setScheme] = useState<'irealb' | 'irealbook'>('irealb');
  const [restored, setRestored] = useState(false);
  const [source, setSource] = useState('songs');
  const [sort, setSort] = useState<'title' | 'composer' | 'style'>('title');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** null when idle, 'loading' while seeding, or the reason it failed. */
  const [seeding, setSeeding] = useState<null | 'loading' | string>(null);
  /** Set when a chart is created, so it opens in the editor on arrival. */
  const openOnArrival = useRef<string | null>(null);

  // Panes
  const [showSources, setShowSources] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [menu, setMenu] = useState<null | 'settings' | 'share' | 'add' | 'key' | 'style'>(null);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);

  // Chart appearance — reading preferences, stored per device, exactly as
  // iReal Pro treats them.
  const [face, setFace] = useState<'script' | 'sans'>('sans');
  // The three page treatments the Mac screenshots show. This is the paper, and
  // it is independent of the app's own light/dark theme.
  const [paper, setPaper] = useState<'white' | 'cream' | 'black'>('white');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [marker, setMarker] = useState<'yellow' | 'red' | 'green' | 'hidden'>('yellow');
  const [highlightMarks, setHighlightMarks] = useState(true);
  const [showBeats, setShowBeats] = useState(false);
  const [horn, setHorn] = useState<InstrumentKey>('C');

  const [transpose, setTranspose] = useState(0);
  const [repeats, setRepeats] = useState(3);
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [editing, setEditing] = useState(false);
  const [showDiagrams, setShowDiagrams] = useState(false);
  const serviceWorker = useServiceWorker();

  // Bring the library back on load. Until this resolves the demo chart stands
  // in, so the app is never blank while storage is opening.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await library.all();
      if (cancelled) return;
      if (stored.length > 0) setEntries(stored);
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [library]);

  /**
   * Fill an empty library once, so a new install has something to read.
   *
   * Guarded twice over: only when storage actually holds nothing -- `entries`
   * is not the test, since it carries the demo chart until the library opens
   * -- and only when the seed has not been attempted before. A user who clears
   * their library is choosing an empty one, and re-downloading it under them
   * would be the app arguing with them.
   */
  const seed = useCallback(
    async (force = false) => {
      const held = await library.count();
      if (held > 0 && !force) return;
      if (!force && (await library.getSetting<string>(SEED_SETTING))) return;

      setSeeding('loading');
      try {
        const playlist = await fetchDefaultLibrary();
        await library.add(playlist);
        await library.setSetting(SEED_SETTING, 'done');
        const stored = await library.all();
        if (stored.length > 0) {
          setEntries(stored);
          setScheme(playlist.scheme);
        }
        setSeeding(null);
      } catch (e) {
        setSeeding(e instanceof Error ? e.message : String(e));
      }
    },
    [library],
  );

  useEffect(() => {
    if (!restored) return;
    void seed();
  }, [restored, seed]);

  /**
   * Start a new chart.
   *
   * It is written to the library immediately rather than held as an unsaved
   * draft: the library is the only place a chart lives, and a new one that
   * exists solely in React state is a chart the user loses by reloading. The
   * editor opens on it straight away, because a blank chart is not something
   * anyone wants to look at -- it is something they want to fill in.
   */
  const createChart = useCallback(async () => {
    setError(null);
    try {
      // Number the title, so two new charts are told apart in the list.
      const taken = new Set(entries.map((entry) => entry.song.title));
      let title = NEW_CHART_TITLE;
      for (let n = 2; taken.has(title); n++) title = `${NEW_CHART_TITLE} ${n}`;

      const song = blankSong(title);

      // A fresh id rather than `songId`, which hashes the *music* alone. That
      // is right for imports -- the same tune arriving twice should be one song
      // however it is titled -- but wrong here: every blank chart has identical
      // music, so content-addressing files them all as one and each new chart
      // silently overwrites the last. An authored chart is a new thing by
      // definition, so it gets an identity of its own.
      const id = `new-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`}`;
      // Saved as `irealbook`, never as the library's current scheme. The stored
      // URI is the song's own record, and a new chart's record is plain text --
      // filing it under `irealb` would claim it was scrambled, and the reparse
      // on the next load would throw and drop the song without a word.
      await library.save(id, song, 'irealbook', null);
      const stored = await library.all();
      if (stored.length > 0) setEntries(stored);
      setSource('songs');
      setQuery('');
      openOnArrival.current = id;
      setSelectedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [library, entries]);

  // The sources sidebar: the library as a whole, a by-style view, and every
  // playlist that has been imported.
  const playlists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.playlist) continue;
      counts.set(entry.playlist, (counts.get(entry.playlist) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const inSource = useMemo(() => {
    if (source.startsWith('pl:')) {
      const name = source.slice(3);
      return entries.filter((e) => e.playlist === name);
    }
    return entries;
  }, [entries, source]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = inSource.filter(
      ({ song }) =>
        !q ||
        song.title.toLowerCase().includes(q) ||
        song.composer.toLowerCase().includes(q),
    );
    const by = (song: Song) =>
      sort === 'composer' ? song.composer : sort === 'style' ? song.style : song.title;
    return [...filtered].sort(
      (a, b) => by(a.song).localeCompare(by(b.song)) || a.song.title.localeCompare(b.song.title),
    );
  }, [inSource, query, sort]);

  // Keep a selection alive across imports, filters and sorts.
  const selected = useMemo(
    () => listed.find((e) => e.id === selectedId) ?? listed[0] ?? null,
    [listed, selectedId],
  );
  const song = selected?.song ?? null;

  // Always built from the parsed song, and always transposed by an absolute
  // offset, so moving through keys never accumulates enharmonic drift.
  const model = useMemo(() => (song ? buildSongModel(song) : null), [song]);
  const shown = useMemo(
    () => (model ? transposeModel(model, transpose + INSTRUMENT_OFFSETS[horn]) : null),
    [model, transpose, horn],
  );

  // A new song brings its own tempo, repeats and key with it.
  useEffect(() => {
    setTranspose(0);
    // Changing song closes the editor -- you were editing that chart, not this
    // one. The exception is a chart just created here: it is blank, so editing
    // it is the only thing anyone wants to do next, and this effect would
    // otherwise close the editor that `createChart` had just opened.
    setEditing(openOnArrival.current !== null);
    openOnArrival.current = null;
    if (model) {
      setRepeats(model.meta.repeats || 3);
      setSettings((s) => ({ ...s, bpm: model.meta.bpm || 140, loop: null }));
    }
  }, [model]);

  // Repeats are a player setting rather than a property of the chart, so the
  // model handed to the player carries the count the user chose.
  const playModel = useMemo(
    () => (model ? { ...model, meta: { ...model.meta, repeats } } : null),
    [model, repeats],
  );

  // Playback follows the written chart, not the transposed view: transposing
  // for a horn changes what you read, not what the band plays.
  const player = usePlayer(playModel, settings);

  useWakeLock(player.playing);

  // The diagram follows the band: whatever bar is sounding, or the first one.
  const diagramBar = player.currentSourceBar !== null ? player.currentSourceBar : 0;
  const diagramChord = shown?.bars[diagramBar]?.chords[0] ?? null;
  const diagramLabel = diagramChord?.root
    ? `${diagramChord.root}${diagramChord.quality}${diagramChord.bass ? `/${diagramChord.bass}` : ''}`
    : '';

  const structure = useMemo(() => {
    if (!model) return null;
    const once = unroll(model, { choruses: 1 });
    const full = unroll({ ...model, meta: { ...model.meta, repeats } });
    const timemap = buildTimemap(full.bars, { bpm: settings.bpm || model.meta.bpm || 160 });
    return { form: once.bars.length, total: full.bars.length, duration: totalDuration(timemap) };
  }, [model, repeats, settings.bpm]);

  const bpm = settings.bpm > 0 ? settings.bpm : model?.meta.bpm || 140;

  /** The key the chart is currently written in, after any transposition. */
  const shownKey = shown?.meta.key ?? '';
  const minor = shownKey.trim().endsWith('-');

  function chooseKey(root: string) {
    if (!model) return;
    const from = keyPitch(model.meta.key || 'C');
    setTranspose((((keyPitch(root) - from) % 12) + 12) % 12);
    setMenu(null);
  }

  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      const texts = await Promise.all(Array.from(files).map((f) => f.text()));
      const parsed = texts.map((t) => parsePlaylist(t));
      if (parsed.every((p) => p.songs.length === 0)) {
        throw new Error('No songs found in that file.');
      }
      // Keep what is already there: importing a second playlist adds to the
      // library rather than replacing it, which is what a user expects.
      for (const p of parsed) await library.add(p);
      setScheme(parsed[0]!.scheme);
      const stored = await library.all();
      if (stored.length > 0) setEntries(stored);
      const name = parsed.find((p) => p.name)?.name;
      setSource(name ? `pl:${name}` : 'songs');
      setSelectedId(null);
      setQuery('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function saveEdit(payload: string) {
    if (!song || !selected) return;
    void (async () => {
      // Swap the music into the record the song came from and reparse, so every
      // other field stays byte-identical. Rebuilding the record from parsed
      // fields would reverse a two-word composer on every save.
      const record = replaceMusic(song.record, scheme, payload);
      const edited = parsePlaylist(`${scheme}://${encodeURIComponent(record)}`).songs[0];
      if (!edited) return;
      await library.save(selected.id, edited, scheme, selected.playlist);
      const stored = await library.all();
      if (stored.length > 0) {
        setEntries(stored);
        setSelectedId(selected.id);
      } else {
        setEntries((list) =>
          list.map((e) => (e.id === selected.id ? { ...e, song: edited } : e)),
        );
      }
    })();
  }

  // Keyboard, the way iReal Pro does it: Space plays, the brackets step the
  // repeats, the dashes step the tempo. Never while a field has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case ' ':
          event.preventDefault();
          player.toggle();
          break;
        case '[':
          setRepeats((r) => Math.max(1, r - 1));
          break;
        case ']':
          setRepeats((r) => Math.min(64, r + 1));
          break;
        case '-':
          setSettings((s) => ({ ...s, bpm: Math.max(40, (s.bpm || bpm) - 4) }));
          break;
        case '=':
          setSettings((s) => ({ ...s, bpm: Math.min(320, (s.bpm || bpm) + 4) }));
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, bpm]);

  const sourceName = source.startsWith('pl:') ? source.slice(3) : 'Library';

  const transport = (
    <>
      <button type="button" className="t-stop" onClick={player.stop} aria-label="Stop">
        <span className="icon-stop" />
      </button>
      <button
        type="button"
        className="t-play"
        onClick={player.toggle}
        aria-label={player.playing ? 'Pause' : 'Play'}
      >
        <span className={player.playing ? 'icon-pause' : 'icon-play'} />
      </button>
      <span className="t-time">{formatDuration(player.positionMs)}</span>
    </>
  );

  const steppers = (
    <>
      <Stepper
        value={String(repeats)}
        caption="Repeats"
        onStep={(d) => setRepeats((r) => Math.max(1, Math.min(64, r + d)))}
      />
      <Stepper
        value={String(bpm)}
        caption="Tempo"
        onStep={(d) =>
          setSettings((s) => ({ ...s, bpm: Math.max(40, Math.min(320, (s.bpm || bpm) + d * 2)) }))
        }
      />
      <Stepper
        value={shownKey || '—'}
        caption="Key"
        onClick={() => setMenu(menu === 'key' ? null : 'key')}
      />
    </>
  );

  return (
    <div
      className={`app theme-${theme} song-${paper}${dragging ? ' dragging' : ''}${
        highlightMarks ? ' marks-hot' : ''
      }${player.playing ? ' is-playing' : ''} marker-${marker}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
      <header className="titlebar">
        <div className="tb-group">
          <button
            type="button"
            className={`tb-btn${showSources ? ' on' : ''}`}
            onClick={() => setShowSources((v) => !v)}
            title="Show or hide the sidebar"
            aria-label="Toggle sidebar"
          >
            <span className="icon-sidebar" />
          </button>
          <span className="wordmark">
            <b>iFake</b>
            <i>Pro</i>
          </span>
        </div>

        <div className="tb-title">{song ? song.title : 'iFakePro'}</div>

        <div className="tb-group tb-right">
          <button
            type="button"
            className={`tb-btn aa${menu === 'settings' ? ' on' : ''}`}
            onClick={() => setMenu(menu === 'settings' ? null : 'settings')}
            title="Chord chart settings"
          >
            Aa
          </button>
          <button
            type="button"
            className="tb-btn"
            onClick={() => void createChart()}
            title="New chart"
          >
            +
          </button>
          <label className="tb-btn" title="Import a playlist">
            <input
              type="file"
              multiple
              accept=".html,.htm,.txt"
              onChange={(e) => void importFiles(e.target.files)}
            />
            <span className="icon-import" />
          </label>
          <button
            type="button"
            className={`tb-btn${editing ? ' on' : ''}`}
            onClick={() => setEditing((v) => !v)}
            disabled={!song}
            title={editing ? 'Close the editor' : 'Edit this chart'}
          >
            <span className="icon-pencil" />
          </button>
          <button
            type="button"
            className={`tb-btn${menu === 'share' ? ' on' : ''}`}
            onClick={() => setMenu(menu === 'share' ? null : 'share')}
            disabled={!song}
            title="Share and export"
          >
            <span className="icon-share" />
          </button>
          <button
            type="button"
            className={`tb-btn${showPanel ? ' on' : ''}`}
            onClick={() => setShowPanel((v) => !v)}
            title="Show or hide the player controls"
            aria-label="Toggle player controls"
          >
            <span className="icon-panel" />
          </button>
        </div>
      </header>

      <div
        className={`panes${showSources ? '' : ' no-sources'}${
          showPanel || editing ? '' : ' no-panel'
        }`}
      >
        {showSources ? (
          <aside className="sources">
            <input
              className="search"
              type="search"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <p className="group">Library</p>
            <button
              type="button"
              className={`src${source === 'songs' ? ' active' : ''}`}
              onClick={() => setSource('songs')}
            >
              <span className="src-icon">♪</span>
              <span className="src-name">Songs</span>
              <span className="src-count">{entries.length}</span>
            </button>
            <button
              type="button"
              className={`src${sort === 'style' ? ' active' : ''}`}
              onClick={() => setSort('style')}
            >
              <span className="src-icon">≣</span>
              <span className="src-name">Styles</span>
            </button>

            <p className="group">
              Playlists
              <label className="group-add" title="Import a playlist">
                <input
                  type="file"
                  multiple
                  accept=".html,.htm,.txt"
                  onChange={(e) => void importFiles(e.target.files)}
                />
                +
              </label>
            </p>
            {playlists.map(([name, count]) => (
              <button
                type="button"
                key={name}
                className={`src${source === `pl:${name}` ? ' active' : ''}`}
                onClick={() => setSource(`pl:${name}`)}
              >
                <span className="src-icon">≡</span>
                <span className="src-name">{name}</span>
                <span className="src-count">{count}</span>
              </button>
            ))}
            {playlists.length === 0 ? (
              <p className="src-empty">
                {!restored
                  ? 'Opening library…'
                  : seeding === 'loading'
                    ? `Fetching ${DEFAULT_LIBRARY.name}…`
                    : 'No playlists yet. Drop an iReal Pro .html or .txt export anywhere to add one.'}
              </p>
            ) : null}

            {typeof seeding === 'string' && seeding !== 'loading' ? (
              <p className="src-empty">
                {seeding}{' '}
                <button type="button" className="linkish" onClick={() => void seed(true)}>
                  Try again
                </button>
              </p>
            ) : null}

            {error ? <p className="error">{error}</p> : null}

            {restored && entries.length > 0 ? (
              <button
                type="button"
                className="src-foot"
                onClick={() =>
                  void library.clear().then(() => {
                    setEntries(
                      parsePlaylist(DEMO_URI).songs.map((s, i) => ({
                        id: `demo-${i}`,
                        song: s,
                        playlist: null,
                      })),
                    );
                    setSource('songs');
                    setSelectedId(null);
                  })
                }
              >
                Empty library
              </button>
            ) : null}
          </aside>
        ) : null}

        <section className="songlist">
          <header className="sl-head">{sourceName}</header>
          <div className="sl-sort">
            {(['title', 'composer', 'style'] as const).map((column) => (
              <button
                type="button"
                key={column}
                className={sort === column ? 'on' : ''}
                onClick={() => setSort(column)}
              >
                {column[0]!.toUpperCase() + column.slice(1)}
                {sort === column ? ' ⌃' : ''}
              </button>
            ))}
          </div>
          <ul className="sl-rows">
            {listed.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={entry.id === selected?.id ? 'active' : ''}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <span className="sl-title">{entry.song.title}</span>
                  <span className="sl-composer">{entry.song.composer || '—'}</span>
                  <span className="sl-meta">
                    <span className="sl-style">{entry.song.style}</span>
                    <span className="sl-bpm">{entry.song.bpm ? `${entry.song.bpm} bpm` : ''}</span>
                    <span className="sl-key">{entry.song.key}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <main className="stage">
          {shown && model ? (
            <>
              <div className="stage-page">
                {editing && song ? (
                  <Editor
                    song={song}
                    panelHost={panelHost}
                    onClose={() => setEditing(false)}
                    onSave={saveEdit}
                  />
                ) : (
                  <Chart
                    model={shown}
                    showBeats={showBeats}
                    face={face}
                    playingBar={marker === 'hidden' ? null : player.currentSourceBar}
                    cuedBar={player.cuedBar}
                    onSeek={(bar) => player.seekToBar(bar)}
                    onSelectRange={(fromBar, toBar) =>
                      setSettings((s) => ({ ...s, loop: { fromBar, toBar } }))
                    }
                    loop={settings.loop}
                  />
                )}
              </div>

              {showDiagrams ? (
                <div className="diagram-dock">
                  <Diagrams chord={diagramChord} label={diagramLabel} />
                </div>
              ) : null}

              {!showPanel || editing ? (
                <div className="bottombar">
                  <button
                    type="button"
                    className="bb-style"
                    onClick={() => setMenu(menu === 'style' ? null : 'style')}
                  >
                    <span className="bb-style-name">{player.pack?.name ?? 'Style'}</span>
                    <span className="stepper-caption">Style</span>
                  </button>
                  <div className="bb-transport">{transport}</div>
                  <div className="bb-steppers">{steppers}</div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty">
              <strong>Nothing on the stand.</strong>
              Pick a tune from the list, or drop an iReal Pro export anywhere in
              the window to fill the library.
            </p>
          )}
        </main>

        <aside
          className={`panel${showPanel || editing ? '' : ' hidden'}`}
          ref={setPanelHost}
          aria-label={editing ? 'Editor' : 'Player controls'}
        >
          {!editing && shown && model ? (
            <div className="player">
              <div className="p-transport">{transport}</div>
              <div className="p-steppers">{steppers}</div>

              <button
                type="button"
                className="p-style"
                onClick={() => setMenu(menu === 'style' ? null : 'style')}
              >
                <span className="p-style-name">{player.pack?.name ?? 'Style'}</span>
                <span className="stepper-caption">Style</span>
              </button>

              <div className="p-row p-seg">
                <span className="p-seg-label">Instrument</span>
                {HORN_KEYS.map((key) => (
                  <button
                    type="button"
                    key={key}
                    className={horn === key ? 'on' : ''}
                    onClick={() => setHorn(key)}
                  >
                    {key === 'Bb' ? 'B♭' : key === 'Eb' ? 'E♭' : key}
                  </button>
                ))}
              </div>

              <div className="p-fader p-master">
                <span className="fader-icon">🔊</span>
                <Fader
                  value={Math.round(settings.masterGain * 100)}
                  onChange={(v) => setSettings((s) => ({ ...s, masterGain: v / 100 }))}
                  label="Master volume"
                />
              </div>
              <p className="stepper-caption centred">Volume</p>

              {player.parts.map((part) => {
                const gain = settings.gains[part] ?? 0.8;
                return (
                  <div className="p-fader p-part" key={part}>
                    <span className={`part-name${gain === 0 ? ' off' : ''}`}>
                      {part[0]!.toUpperCase() + part.slice(1)}
                    </span>
                    <Fader
                      value={Math.round(gain * 100)}
                      label={`${part} volume`}
                      onChange={(v) => {
                        const next = v / 100;
                        setSettings((s) => ({
                          ...s,
                          gains: { ...s.gains, [part]: next },
                          // A fader at the far left is a mute, which is what
                          // iReal Pro does and what a player expects.
                          muted:
                            next === 0
                              ? [...new Set([...s.muted, part])]
                              : s.muted.filter((p) => p !== part),
                        }));
                      }}
                    />
                  </div>
                );
              })}

              <div className="p-fader p-reverb">
                <span className="part-name">Reverb</span>
                <Fader
                  value={Math.round(settings.reverb * 100)}
                  onChange={(v) => setSettings((s) => ({ ...s, reverb: v / 100 }))}
                  label="Reverb"
                />
              </div>

              <button
                type="button"
                className="p-button"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    gains: {},
                    muted: [],
                    reverb: DEFAULT_SETTINGS.reverb,
                    masterGain: DEFAULT_SETTINGS.masterGain,
                  }))
                }
              >
                Reset Instruments
              </button>

              <label className="p-check">
                <input
                  type="checkbox"
                  checked={settings.embellish}
                  onChange={() => setSettings((s) => ({ ...s, embellish: !s.embellish }))}
                />
                Embellished Chords
              </label>

              <p className="p-slider-label">
                Practice Tempo:{' '}
                {settings.tempoRampPerChorus ? `+${settings.tempoRampPerChorus} bpm` : 'Off'}
              </p>
              <Fader
                className="p-slider"
                max={20}
                value={settings.tempoRampPerChorus}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, tempoRampPerChorus: Math.round(v / 5) * 5 }))
                }
                label="Automatic tempo increase per chorus"
              />

              <p className="p-slider-label">
                Practice Transposition:{' '}
                {settings.keyCyclePerChorus === 0
                  ? 'Off'
                  : settings.keyCyclePerChorus === 1
                    ? 'Semitone'
                    : settings.keyCyclePerChorus === 5
                      ? 'Fourths'
                      : 'Fifths'}
              </p>
              <Fader
                className="p-slider"
                max={3}
                value={[0, 1, 5, 7].indexOf(settings.keyCyclePerChorus)}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, keyCyclePerChorus: [0, 1, 5, 7][v]! }))
                }
                label="Automatic transposition per chorus"
              />

              <button
                type="button"
                className={`p-button${showDiagrams ? ' on' : ''}`}
                onClick={() => setShowDiagrams((v) => !v)}
              >
                Chord Diagrams
              </button>

              <div className="p-row p-inline">
                <span className="p-inline-label">Count-In:</span>
                <select
                  value={settings.countInBars}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, countInBars: Number(e.target.value) }))
                  }
                  aria-label="Count-in duration"
                >
                  <option value={0}>No Count-In</option>
                  <option value={1}>1 Measure</option>
                  <option value={2}>2 Measures</option>
                </select>
              </div>

              <div className="p-row p-inline">
                <span className="p-inline-label">Loop:</span>
                {settings.loop ? (
                  <button
                    type="button"
                    className="on"
                    onClick={() => setSettings((s) => ({ ...s, loop: null }))}
                  >
                    bars {settings.loop.fromBar + 1}–{settings.loop.toBar + 1} ×
                  </button>
                ) : (
                  <span className="p-hint">drag across the chart</span>
                )}
              </div>

              {structure ? (
                <p className="p-structure">
                  {structure.form} bars · {structure.total} played ·{' '}
                  {formatDuration(structure.duration)}
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      {menu ? <div className="scrim" onClick={() => setMenu(null)} /> : null}

      {menu === 'settings' ? (
        <div className="popover pop-settings">
          <p className="pop-group">Font</p>
          <div className="pop-seg">
            {(['script', 'sans'] as const).map((f) => (
              <button
                type="button"
                key={f}
                className={face === f ? 'on' : ''}
                onClick={() => setFace(f)}
              >
                {f === 'script' ? 'Handwriting' : 'Classic'}
              </button>
            ))}
          </div>

          <p className="pop-group">Paper</p>
          <div className="pop-seg">
            {(['white', 'cream', 'black'] as const).map((t) => (
              <button
                type="button"
                key={t}
                className={paper === t ? 'on' : ''}
                onClick={() => setPaper(t)}
              >
                {t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <p className="pop-group">Theme</p>
          <div className="pop-seg">
            {(['light', 'dark', 'auto'] as const).map((t) => (
              <button
                type="button"
                key={t}
                className={theme === t ? 'on' : ''}
                onClick={() => setTheme(t)}
              >
                {t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <p className="pop-group">Playback Position</p>
          <div className="pop-seg">
            {(['yellow', 'red', 'green', 'hidden'] as const).map((m) => (
              <button
                type="button"
                key={m}
                className={marker === m ? 'on' : ''}
                onClick={() => setMarker(m)}
              >
                {m[0]!.toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <label className="pop-check">
            <input
              type="checkbox"
              checked={highlightMarks}
              onChange={() => setHighlightMarks((v) => !v)}
            />
            Highlight Rehearsal Symbols
          </label>
          <label className="pop-check">
            <input type="checkbox" checked={showBeats} onChange={() => setShowBeats((v) => !v)} />
            Show beat counts
          </label>
        </div>
      ) : null}

      {menu === 'key' && model ? (
        <div className="popover pop-key">
          {KEY_ROOTS.map((root) => {
            const label = `${root}${minor ? '-' : ''}`;
            const isDefault = keyPitch(root) === keyPitch(model.meta.key || 'C');
            return (
              <button
                type="button"
                key={root}
                className={label === shownKey.trim() ? 'on' : ''}
                onClick={() => chooseKey(root)}
              >
                {label}
                {isDefault ? <span className="pop-default">Default</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {menu === 'style' ? (
        <div className="popover pop-style">
          <button
            type="button"
            className={settings.grooveId === null ? 'on' : ''}
            onClick={() => {
              setSettings((s) => ({ ...s, grooveId: null }));
              setMenu(null);
            }}
          >
            Auto{player.pack ? ` · ${player.pack.name}` : ''}
          </button>
          {['jazz', 'latin', 'pop'].map((family) => (
            <div key={family}>
              <p className="pop-group">{family}</p>
              {PACKS.filter((p) => p.family === family).map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={settings.grooveId === p.id ? 'on' : ''}
                  onClick={() => {
                    setSettings((s) => ({ ...s, grooveId: p.id }));
                    setMenu(null);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {menu === 'share' && song && model ? (
        <div className="popover pop-share">
          <button type="button" onClick={() => window.print()}>
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() =>
              download(
                `${safeFileName(song.title)}.html`,
                toHtml([song], { scheme }),
                'text/html',
              )
            }
          >
            Share chart (iReal Pro)
          </button>
          <button
            type="button"
            onClick={() =>
              download(
                `${safeFileName(sourceName)}.html`,
                toHtml(
                  listed.map((e) => e.song),
                  { name: sourceName, scheme },
                ),
                'text/html',
              )
            }
          >
            Export {sourceName} ({listed.length})
          </button>
          <button
            type="button"
            onClick={() =>
              download(
                `${safeFileName(model.meta.title)}.musicxml`,
                toMusicXml(model),
                'application/vnd.recordare.musicxml+xml',
              )
            }
          >
            MusicXML
          </button>
          <button
            type="button"
            onClick={() => {
              const rendered = player.exportEvents();
              if (!rendered) return;
              download(
                `${safeFileName(model.meta.title)}.mid`,
                toMidiFile(rendered.events, { bpm: rendered.bpm }),
                'audio/midi',
              );
            }}
          >
            MIDI
          </button>
        </div>
      ) : null}

      {serviceWorker.updateReady ? (
        <div className="banner" role="status">
          <span>A new version is ready.</span>
          <button type="button" onClick={serviceWorker.update}>
            Reload
          </button>
          <button type="button" className="quiet" onClick={serviceWorker.dismiss}>
            Later
          </button>
        </div>
      ) : null}

      <div className="dropzone-hint">Drop an iReal Pro .html or .txt export</div>
    </div>
  );
}
