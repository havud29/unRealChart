import { useCallback, useEffect, useRef, useState } from 'react';
import type { SongModel } from '@unrealchart/song-model';
import { entryAt } from '@unrealchart/song-model';
import { packById, renderClick, renderGroove, selectPack } from '@unrealchart/groove-engine';
import type { GroovePack, RenderResult } from '@unrealchart/groove-engine';
import { SampledInstruments, Transport, repeatSpan } from '@unrealchart/audio-host';

/**
 * Playback, as one hook.
 *
 * The AudioContext is created on the first play rather than on mount, because
 * browsers only allow it in response to a gesture. Everything else — rendering
 * events, loading the transport, following the playhead — hangs off that.
 */

export interface PlayerSettings {
  bpm: number;
  countInBars: number;
  embellish: boolean;
  muted: string[];
  /** Bar range to loop, as indices into `model.bars`. Inclusive of both ends. */
  loop: { fromBar: number; toBar: number } | null;
  tempoRampPerChorus: number;
  /** Semitones the band moves each chorus. */
  keyCyclePerChorus: number;
  /** Override the groove chosen from the chart's style. */
  grooveId: string | null;
  /** Per-part fader positions, 0..1. A part at 0 is muted. */
  gains: Record<string, number>;
  /** Send level shared by every part, 0..1. */
  reverb: number;
  /** Master fader, 0..1. */
  masterGain: number;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  bpm: 0, // 0 means "use the chart's tempo"
  countInBars: 1,
  embellish: false,
  muted: [],
  loop: null,
  tempoRampPerChorus: 0,
  keyCyclePerChorus: 0,
  grooveId: null,
  gains: {},
  reverb: 0.16,
  masterGain: 0.85,
};

export interface Player {
  ready: boolean;
  playing: boolean;
  /** Index into the unrolled bar list, or null when not playing. */
  currentBar: number | null;
  /** Index into `model.bars` — what the chart highlights. */
  currentSourceBar: number | null;
  positionMs: number;
  durationMs: number;
  /**
   * The bar playback starts from, set by clicking the chart while stopped.
   * Null means the top of the song.
   */
  cuedBar: number | null;
  pack: GroovePack | null;
  parts: string[];
  toggle: () => void;
  stop: () => void;
  seekToBar: (sourceBar: number) => void;
  setMuted: (part: string, muted: boolean) => void;
  /** The rendered events, for export. Rendered on demand if not already. */
  exportEvents: () => { events: RenderResult['events']; bpm: number } | null;
}

/** How many times a loop repeats before it runs out. Long enough to practise. */
const LOOP_PASSES = 64;

export function usePlayer(model: SongModel | null, settings: PlayerSettings): Player {
  const transportRef = useRef<Transport | null>(null);
  const renderRef = useRef<RenderResult | null>(null);
  const frameRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [currentBar, setCurrentBar] = useState<number | null>(null);
  /**
   * Where play begins.
   *
   * Once a transport exists this lives in the transport itself -- seeking it
   * while stopped just moves its paused position, and `play()` with no
   * argument resumes from there. Before the first play there is no transport
   * to hold it (a browser only lets us build the audio graph inside a
   * gesture), so the bar is remembered here and applied the moment one exists.
   */
  const [cuedBar, setCuedBar] = useState<number | null>(null);
  const cuedBarRef = useRef<number | null>(null);

  const meter = model?.bars[0]
    ? `${model.bars[0].time.beats}/${model.bars[0].time.beatType}`
    : '4/4';
  // The chart's style picks a groove; the user can overrule it, which matters
  // now there are nineteen and a label like "Latin" could mean several.
  const pack = model
    ? (settings.grooveId ? packById(settings.grooveId) : null) ??
      selectPack(model.meta.groove || model.meta.style, meter)
    : null;

  // Re-render whenever anything that changes the notes changes.
  const rebuild = useCallback((): RenderResult | null => {
    if (!model || !pack) return null;
    const bpm = settings.bpm > 0 ? settings.bpm : model.meta.bpm || 140;
    const result = renderGroove(model, pack, {
      bpm,
      countInBars: settings.countInBars,
      tempoRampPerChorus: settings.tempoRampPerChorus,
      keyCyclePerChorus: settings.keyCyclePerChorus,
      embellish: settings.embellish,
      mute: settings.muted,
    });
    const click = renderClick(result.timemap, result.bars, {
      countInBars: settings.countInBars,
    });
    let events = [...click, ...result.events].sort((a, b) => a.startMs - b.startMs);
    let durationMs = result.durationMs;
    let timemap = result.timemap;

    if (settings.loop) {
      // Loop by repeating the span rather than rewinding a cursor, so playback
      // stays one forward pass with no seam at the wrap.
      const { fromBar, toBar } = settings.loop;
      const low = Math.min(fromBar, toBar);
      const high = Math.max(fromBar, toBar);

      // A bar can appear many times in the unrolled sequence — repeats, endings,
      // choruses — so a source-bar range does not name one span of time. Take
      // the first occurrence of the opening bar and run forward while the bars
      // stay inside the range; that is the pass the user pointed at.
      const start = result.timemap.find((e) => e.sourceIndex === low);
      let end = start;
      if (start) {
        for (let i = start.index + 1; i < result.timemap.length; i++) {
          const entry = result.timemap[i]!;
          if (entry.sourceIndex < low || entry.sourceIndex > high) break;
          end = entry;
        }
      }

      if (start && end) {
        const fromMs = start.startMs;
        const toMs = end.startMs + end.durationMs;
        const span = toMs - fromMs;
        if (span > 0) {
          events = repeatSpan(events, fromMs, toMs, LOOP_PASSES);
          durationMs = span * LOOP_PASSES;
          // Rebuild the timemap for the looped material, so the playhead still
          // knows which bar is sounding on the ninth time round.
          const inside = result.timemap.filter((e) => e.startMs >= fromMs && e.startMs < toMs);
          timemap = [];
          for (let pass = 0; pass < LOOP_PASSES; pass++) {
            for (const entry of inside) {
              timemap.push({
                ...entry,
                index: timemap.length,
                startMs: entry.startMs - fromMs + pass * span,
              });
            }
          }
        }
      }
    }

    return { ...result, events, durationMs, timemap };
  }, [
    model,
    pack,
    settings.bpm,
    settings.countInBars,
    settings.tempoRampPerChorus,
    settings.keyCyclePerChorus,
    settings.embellish,
    settings.muted,
    settings.loop,
  ]);

  // Keep the loaded material in step with the settings, without interrupting.
  useEffect(() => {
    const result = rebuild();
    renderRef.current = result;
    if (transportRef.current && result) {
      transportRef.current.load(result.events, result.durationMs);
    }
  }, [rebuild]);

  // Follow the playhead on animation frames, never from scheduler callbacks —
  // those fire ahead of the sound by design.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;

    const follow = () => {
      if (cancelled) return;
      const transport = transportRef.current;
      const result = renderRef.current;
      if (transport && result) {
        const ms = transport.positionMs;
        setPositionMs(ms);
        const entry = entryAt(result.timemap, ms);
        setCurrentBar(entry ? entry.index : null);
      }
      frameRef.current = requestAnimationFrame(follow);
    };

    frameRef.current = requestAnimationFrame(follow);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
    };
  }, [playing]);

  /** Move the transport to the cued bar. Returns the position it landed on. */
  const seekToCue = useCallback((transport: Transport, result: RenderResult): number => {
    const bar = cuedBarRef.current;
    if (bar === null) return 0;
    const entry = result.timemap.find((e) => e.sourceIndex === bar);
    if (!entry) return 0;
    transport.seek(entry.startMs);
    return entry.startMs;
  }, []);

  const stop = useCallback(() => {
    const transport = transportRef.current;
    transport?.stop();
    setPlaying(false);
    setCurrentBar(null);
    // Stop returns to the cued bar rather than the top: the point of cueing a
    // bar is to play it again, and having to re-click it after every stop is
    // exactly the friction the cue exists to remove.
    const result = renderRef.current;
    setPositionMs(transport && result ? seekToCue(transport, result) : 0);
  }, [seekToCue]);

  const toggle = useCallback(() => {
    const existing = transportRef.current;
    if (existing?.playing) {
      existing.pause();
      setPlaying(false);
      return;
    }

    let transport = existing;
    if (!transport) {
      // First gesture: this is the only moment a browser will let us start.
      const context = new AudioContext();
      // Recorded instruments where a bank has been fetched, synthesised where
      // not. The provider decides per instrument, so a partial download still
      // helps rather than being all or nothing.
      transport = new Transport(context, {
        instruments: new SampledInstruments(context, import.meta.env.BASE_URL),
      });
      transport.onEnded = () => {
        setPlaying(false);
        setCurrentBar(null);
      };
      transportRef.current = transport;
      setReady(true);
    }

    const result = renderRef.current ?? rebuild();
    renderRef.current = result;
    if (!result) return;
    transport.load(result.events, result.durationMs);
    // A cue set before the first play has been waiting for a transport to put
    // it on. Applying it only when the transport is fresh is what keeps a
    // pause-then-resume from jumping back to the cue mid-song.
    if (!existing) seekToCue(transport, result);
    void transport.play();
    setPlaying(true);
  }, [rebuild, seekToCue]);

  /**
   * Point playback at a bar.
   *
   * While playing this jumps there. While stopped it cues the bar, so the next
   * play starts from it -- including before the first play, when there is no
   * transport yet.
   */
  const seekToBar = useCallback((sourceBar: number) => {
    cuedBarRef.current = sourceBar;
    setCuedBar(sourceBar);

    const result = renderRef.current ?? rebuild();
    if (!result) return;
    renderRef.current = result;
    const entry = result.timemap.find((e) => e.sourceIndex === sourceBar);
    if (!entry) return;

    // The clock moves to the cue even before a transport exists, so it reads
    // as where playback will begin rather than sitting at zero next to a cue
    // halfway down the chart.
    const transport = transportRef.current;
    transport?.seek(entry.startMs);
    if (!transport?.playing) setPositionMs(entry.startMs);
  }, [rebuild]);

  const setMuted = useCallback((part: string, muted: boolean) => {
    transportRef.current?.mixer.set(part, { muted });
  }, []);

  // The faders reach the mixer directly rather than through a re-render: a
  // musician expects a slider to take effect on the next beat, not on the next
  // rebuild of the whole song. `ready` is in the deps so the levels are applied
  // the moment the transport is created by the first gesture.
  useEffect(() => {
    const transport = transportRef.current;
    if (!transport) return;
    transport.mixer.setMasterGain(settings.masterGain);
    for (const [part, gain] of Object.entries(settings.gains)) {
      transport.mixer.set(part, { gain, reverb: settings.reverb });
    }
  }, [ready, settings.gains, settings.reverb, settings.masterGain]);

  // Tear the audio graph down with the component.
  useEffect(() => {
    return () => {
      transportRef.current?.stop();
    };
  }, []);

  const exportEvents = useCallback(() => {
    const rendered = renderRef.current ?? rebuild();
    if (!rendered || !model) return null;
    return {
      events: rendered.events,
      bpm: settings.bpm > 0 ? settings.bpm : model.meta.bpm || 140,
    };
  }, [rebuild, model, settings.bpm]);

  const result = renderRef.current;
  const sourceBar =
    currentBar !== null && result ? (result.timemap[currentBar]?.sourceIndex ?? null) : null;

  return {
    ready,
    playing,
    currentBar,
    currentSourceBar: sourceBar,
    positionMs,
    durationMs: result?.durationMs ?? 0,
    cuedBar,
    pack,
    parts: pack ? pack.parts.map((p) => p.id) : [],
    toggle,
    stop,
    seekToBar,
    setMuted,
    exportEvents,
  };
}
