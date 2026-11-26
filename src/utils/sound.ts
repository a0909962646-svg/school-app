/**
 * Web Audio API sound synthesizer for classroom lucky draw & grouping.
 * Zero external audio dependencies; unlocks cleanly on user interaction.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // Ignore autoplay resume errors
    });
  }
  return audioCtx;
}

/**
 * Crisp wooden marimba-like tick during the name roulette spin.
 * Progress (0 to 1) gently raises pitch as suspense builds.
 */
export function playSpinTick(progress: number, enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Base frequency rises gently from 420Hz to 680Hz
  const freq = 420 + Math.min(1, Math.max(0, progress)) * 260;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + 0.045);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.06);
}

/**
 * Uplifting celebratory classroom chime arpeggio when a student is selected.
 */
export function playWinnerFanfare(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Bright C major 9th arpeggio: C5, E5, G5, C6
  const notes = [523.25, 659.25, 783.99, 1046.5];

  notes.forEach((freq, idx) => {
    const startTime = now + idx * 0.075;
    const duration = idx === notes.length - 1 ? 0.65 : 0.32;

    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(freq * 2, startTime);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.04, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(idx === notes.length - 1 ? 0.2 : 0.14, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc.connect(gain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    harmonic.start(startTime);
    osc.stop(startTime + duration + 0.02);
    harmonic.stop(startTime + duration + 0.02);
  });
}

/**
 * Quick card-riffle cascade sound when auto-grouping shuffles students.
 */
export function playShuffleCascade(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [392.0, 440.0, 493.88, 523.25, 587.33, 659.25];

  notes.forEach((freq, i) => {
    const start = now + i * 0.04;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.09, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.1);
  });
}
