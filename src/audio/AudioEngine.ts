/**
 * Web Audio foundation. No audio files exist in this project — every sound is
 * synthesised from oscillators and generated noise buffers.
 *
 * ### Structure
 * ```
 * sources ──► sfxBus ──┐
 *                      ├──► masterGain ──► compressor ──► destination
 * music   ──► musicBus ┘
 * ```
 * Separate buses let the settings screen mix music and effects independently
 * while one master control still mutes everything.
 *
 * A `DynamicsCompressor` on the master bus is doing real work: several
 * simultaneous impacts on the arcade course would otherwise clip, and clipped
 * synthesis sounds like a bug rather than a loud moment.
 *
 * The context starts suspended in every modern browser. `unlock()` is wired to
 * the first user gesture and is safe to call repeatedly.
 */
export class AudioEngine {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly sfxBus: GainNode;
  readonly musicBus: GainNode;

  private readonly compressor: DynamicsCompressorNode;
  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctor();

    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;
    this.compressor.connect(this.context.destination);

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.compressor);

    this.sfxBus = this.context.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.masterGain);

    this.musicBus = this.context.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.masterGain);
  }

  get now(): number {
    return this.context.currentTime;
  }

  get ready(): boolean {
    return this.context.state === 'running';
  }

  /** Resumes the context. Must be called from a user-gesture handler. */
  async unlock(): Promise<void> {
    if (this.unlocked && this.context.state === 'running') return;
    try {
      await this.context.resume();
      this.unlocked = true;
    } catch {
      /* Autoplay policy refused; the next gesture will try again. */
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    const t = this.now;
    this.masterGain.gain.setTargetAtTime(master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
  }

  /**
   * White-noise buffer, generated once and shared by every noise-based voice
   * (impacts, wind, splashes). Two seconds is long enough that looping is
   * inaudible for the sustained sources.
   */
  noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  /** Noise shaped by a decaying envelope — the basis of every impact sound. */
  noiseBurst(options: {
    destination?: AudioNode;
    duration?: number;
    gain?: number;
    filter?: BiquadFilterType;
    frequency?: number;
    q?: number;
    /** Frequency the filter sweeps to over the burst. */
    sweepTo?: number;
    playbackRate?: number;
    when?: number;
  } = {}): void {
    const {
      destination = this.sfxBus,
      duration = 0.16,
      gain = 0.4,
      filter = 'bandpass',
      frequency = 900,
      q = 1.2,
      sweepTo,
      playbackRate = 1,
      when = this.now,
    } = options;

    const source = this.context.createBufferSource();
    source.buffer = this.noise();
    source.playbackRate.value = playbackRate;
    // Random offset so repeated hits never sound like the same sample.
    const offset = Math.random() * 1.5;

    const biquad = this.context.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(frequency, when);
    biquad.Q.value = q;
    if (sweepTo !== undefined) {
      biquad.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), when + duration);
    }

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    source.connect(biquad);
    biquad.connect(envelope);
    envelope.connect(destination);
    source.start(when, offset, duration + 0.05);
    source.stop(when + duration + 0.05);
  }

  /** Single oscillator voice with an ADSR-ish envelope and optional pitch glide. */
  tone(options: {
    destination?: AudioNode;
    type?: OscillatorType;
    frequency: number;
    /** Frequency to glide to over the note. */
    glideTo?: number;
    duration?: number;
    attack?: number;
    gain?: number;
    detune?: number;
    when?: number;
  }): void {
    const {
      destination = this.sfxBus,
      type = 'sine',
      frequency,
      glideTo,
      duration = 0.25,
      attack = 0.008,
      gain = 0.25,
      detune = 0,
      when = this.now,
    } = options;

    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(frequency, when);
    if (glideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), when + duration);
    }

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  /** Creates a persistent gain node for looping voices (wind, rolling). */
  createBus(volume = 1, destination: AudioNode = this.sfxBus): GainNode {
    const gain = this.context.createGain();
    gain.gain.value = volume;
    gain.connect(destination);
    return gain;
  }

  /** Simple feedback delay used to give the arcade theme its space. */
  createDelay(time = 0.28, feedback = 0.32, mix = 0.25, destination: AudioNode = this.sfxBus): GainNode {
    const input = this.context.createGain();
    const delay = this.context.createDelay(1);
    delay.delayTime.value = time;
    const feedbackGain = this.context.createGain();
    feedbackGain.gain.value = feedback;
    const wet = this.context.createGain();
    wet.gain.value = mix;
    const damping = this.context.createBiquadFilter();
    damping.type = 'lowpass';
    damping.frequency.value = 2600;

    input.connect(destination);
    input.connect(delay);
    delay.connect(damping);
    damping.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(wet);
    wet.connect(destination);

    return input;
  }

  dispose(): void {
    void this.context.close();
  }
}
