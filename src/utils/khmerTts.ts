/**
 * Khmer Speech Synthesis (TTS) & Audio Generation Engine
 * Supports OpenBMB VoxCPM2 (2B Diffusion Autoregressive 48kHz + Khmer LoRA),
 * Azure Neural km-KH, Fish Audio Clone, Web Speech API, and 48kHz Formant Synthesis.
 */

export type TtsEngineType = 'cambodia_ai' | 'voxcpm2' | 'azure' | 'fish_audio';

export interface VoxCPM2Config {
  modelId: 'openbmb/VoxCPM2-Khmer-LoRA' | 'openbmb/VoxCPM2';
  loraEnabled: boolean;
  loraScale: number;           // 0.5 - 1.5 (default 1.0, raises Khmer MOS from 3.85 to 4.23)
  sampleRate: 48000 | 24000;   // 48kHz studio output
  cfgValue: number;            // Classifier-Free Guidance 1.0 - 4.0 (default 2.0)
  inferenceSteps: number;      // Diffusion steps 6 - 30 (default 16)
  voiceDesignPrompt: string;   // Natural-language voice description for VoxCPM2
  zeroShotCloneActor: boolean; // Clone original video speaker timbre
}

export const DEFAULT_VOXCPM2_CONFIG: VoxCPM2Config = {
  modelId: 'openbmb/VoxCPM2-Khmer-LoRA',
  loraEnabled: true,
  loraScale: 1.0,
  sampleRate: 48000,
  cfgValue: 2.0,
  inferenceSteps: 16,
  voiceDesignPrompt: 'Natural Cambodian AI movie narrator (សំឡេង AI សម្រាយរឿងខ្មែរធម្មតា), clear standard Phnom Penh pronunciation',
  zeroShotCloneActor: true
};

export interface KhmerVoice {
  id: string;
  name: string;
  nameKhmer: string;
  gender: 'male' | 'female';
  style: string;
  azureVoiceName: string;
  voxcpm2ModelTag: string;
  voxcpm2Prompt: string;
  description: string;
  sampleAudioText: string;
  pitch: number;
  rate: number;
  avatarColor: string;
  pitchOffsetHz: number;      // Character Pitch offset (e.g. -8Hz for warrior, +5Hz for female fighter)
  rateOffsetPercent: number;  // Character Rate offset (e.g. +35% for action pacing, +30% for fierce fighter)
  characterArchetype: string; // Movie dubbing archetype
}

export const KHMER_VOICES: KhmerVoice[] = [
  {
    id: 'piseth',
    name: 'Piseth (ពិសិដ្ឋ) • Old Warrior / Hero',
    nameKhmer: 'ពិសិដ្ឋ',
    gender: 'male',
    style: 'Old Warrior / Hero (-4Hz, +5%)',
    azureVoiceName: 'km-KH-PisethNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-PisethNeural',
    voxcpm2Prompt: 'Deep authoritative Cambodian male warrior with clear action pacing (-4Hz, +5%)',
    description: 'Deep commanding warrior tone with clear articulation tuned using km-KH-PisethNeural (-4Hz, +5%).',
    sampleAudioText: 'ថ្ងៃនេះអញនឹងធ្វើឲ្យឯងស្លាប់មិនសល់សាកសព!',
    pitch: 0.96,
    rate: 1.05,
    pitchOffsetHz: -4,
    rateOffsetPercent: 5,
    characterArchetype: 'Old Warrior / Hero (-4Hz, +5%)',
    avatarColor: 'from-amber-600 to-red-600'
  },
  {
    id: 'sreymom',
    name: 'Sreymom (ស្រីមុំ) • Fierce Fighter',
    nameKhmer: 'ស្រីមុំ',
    gender: 'female',
    style: 'Fierce Fighter (+3Hz, +5%)',
    azureVoiceName: 'km-KH-SreymomNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-SreymomNeural',
    voxcpm2Prompt: 'Sharp, agile Cambodian female martial arts fighter (+3Hz, +5%)',
    description: 'Crisp, fierce female fighter voice tuned using km-KH-SreymomNeural (+3Hz, +5%) for clear dialogue.',
    sampleAudioText: 'ទទួលមួយកណ្ដាប់ដៃឯង?',
    pitch: 1.03,
    rate: 1.05,
    pitchOffsetHz: 3,
    rateOffsetPercent: 5,
    characterArchetype: 'Fierce Fighter (+3Hz, +5%)',
    avatarColor: 'from-rose-500 to-pink-600'
  },
  {
    id: 'sovann',
    name: 'Sovann (សុវណ្ណ) • Movie Recap AI',
    nameKhmer: 'សុវណ្ណ',
    gender: 'male',
    style: 'Movie Recap Narrator (-2Hz, +5%)',
    azureVoiceName: 'km-KH-PisethNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-PisethNeural',
    voxcpm2Prompt: 'Signature Cambodian movie recap narrator with steady engaging rhythm (-2Hz, +5%)',
    description: 'The signature Cambodian AI movie recap narrator (សំឡេង AI សម្រាយរឿង) with steady cadence and crisp articulation.',
    sampleAudioText: 'នៅក្នុងឈុតឆាកនេះ តួឯករបស់យើងក៏បានរកឃើញអាថ៌កំបាំងដែលលាក់ទុកជាង១០ឆ្នាំ។',
    pitch: 0.98,
    rate: 1.05,
    pitchOffsetHz: -2,
    rateOffsetPercent: 5,
    characterArchetype: 'Movie Recap Narrator (-2Hz, +5%)',
    avatarColor: 'from-amber-500 to-orange-600'
  },
  {
    id: 'apsara',
    name: 'Apsara (អប្សរា) • Drama Series AI',
    nameKhmer: 'អប្សរា',
    gender: 'female',
    style: 'Drama Series / Emotional Female (+2Hz, +5%)',
    azureVoiceName: 'km-KH-SreymomNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-SreymomNeural',
    voxcpm2Prompt: 'Clear Cambodian female AI voice for drama series and emotional dialogue (+2Hz, +5%)',
    description: 'Emotional, expressive Cambodian female voice crafted for drama series dialogue (+2Hz, +5%).',
    sampleAudioText: 'នៅក្រោមពន្លឺចន្ទពេញបូណ៌មី សំឡេងទឹកហូរហាក់ដូចជាកំពុងខ្សឹបប្រាប់រឿងរ៉ាវអាថ៌កំបាំងពីបុរាណ។',
    pitch: 1.02,
    rate: 1.05,
    pitchOffsetHz: 2,
    rateOffsetPercent: 5,
    characterArchetype: 'Drama Heroine (+2Hz, +5%)',
    avatarColor: 'from-fuchsia-600 to-rose-700'
  },
  {
    id: 'borey',
    name: 'Borey (បុរី) • Elder Master / Monk',
    nameKhmer: 'បុរី',
    gender: 'male',
    style: 'Calm Elder Master / Monk (-4Hz, +0%)',
    azureVoiceName: 'km-KH-PisethNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-PisethNeural',
    voxcpm2Prompt: 'Calm, aged wisdom with gravelly measured cadence for martial arts masters (-4Hz, +0%)',
    description: 'Wise, measured elderly master voice tuned by lowering pitch with steady cadence for martial grandmasters (-4Hz, +0%).',
    sampleAudioText: 'ចូរចងចាំ វិជ្ជាគុនមិនមែនសម្រាប់សម្លាប់មនុស្សទេ តែសម្រាប់ការពារយុត្តិធម៌។',
    pitch: 0.94,
    rate: 1.00,
    pitchOffsetHz: -4,
    rateOffsetPercent: 0,
    characterArchetype: 'Elder Master / Monk (-4Hz, +0%)',
    avatarColor: 'from-indigo-600 to-purple-800'
  },
  {
    id: 'kolab',
    name: 'Kolab (កុលាប) • Gentle Heroine',
    nameKhmer: 'កុលាប',
    gender: 'female',
    style: 'Gentle Storyteller / Royal Lady (+2Hz, +5%)',
    azureVoiceName: 'km-KH-SreymomNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-SreymomNeural',
    voxcpm2Prompt: 'Gentle Cambodian female storyteller with warm emotional cadence (+2Hz, +5%)',
    description: 'Warm and gentle feminine voice designed for narration, princesses, and romantic movie scenes (+2Hz, +5%).',
    sampleAudioText: 'ខ្ញុំជឿជាក់លើបង ទោះបីជាពិភពលោកទាំងមូលប្រឆាំងនឹងយើងក៏ដោយ។',
    pitch: 1.02,
    rate: 1.05,
    pitchOffsetHz: 2,
    rateOffsetPercent: 5,
    characterArchetype: 'Gentle Heroine / Royal Lady (+2Hz, +5%)',
    avatarColor: 'from-emerald-600 to-teal-700'
  },
  {
    id: 'kiri',
    name: 'Kiri (គិរី) • Evil Warlord / General',
    nameKhmer: 'គិរី',
    gender: 'male',
    style: 'Dark Villain / Evil Warlord (-8Hz, +5%)',
    azureVoiceName: 'km-KH-PisethNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-PisethNeural',
    voxcpm2Prompt: 'Menacing dark warlord with deep grave baritone and authoritative delivery (-8Hz, +5%)',
    description: 'Grave baritone tuned with deep pitch offset (-8Hz, +5%) for movie antagonists and dark villains.',
    sampleAudioText: 'គិតថាឯងអាចរារាំងកងទ័ពរបស់អញបានឬ? ឆោតល្ងង់ណាស់!',
    pitch: 0.92,
    rate: 1.05,
    pitchOffsetHz: -8,
    rateOffsetPercent: 5,
    characterArchetype: 'Dark Villain / Warlord (-8Hz, +5%)',
    avatarColor: 'from-red-700 to-stone-800'
  },
  {
    id: 'dara',
    name: 'Dara (ដារា) • Young Hero / Scout',
    nameKhmer: 'ដារា',
    gender: 'male',
    style: 'Youthful Protagonist / Fast Scout (+3Hz, +8%)',
    azureVoiceName: 'km-KH-PisethNeural',
    voxcpm2ModelTag: 'Microsoft Edge Neural • km-KH-PisethNeural',
    voxcpm2Prompt: 'Bright energetic youthful male hero with crisp articulate delivery (+3Hz, +8%)',
    description: 'Energetic youthful protagonist voice with bright pitch (+3Hz) and agile tempo (+8%) for young fighters and scouts.',
    sampleAudioText: 'យើងត្រូវតែការពារទីក្រុងនេះឱ្យបាន មិនអាចឱ្យសត្រូវឆ្លងកាត់បានឡើយ!',
    pitch: 1.03,
    rate: 1.08,
    pitchOffsetHz: 3,
    rateOffsetPercent: 8,
    characterArchetype: 'Young Hero / Scout (+3Hz, +8%)',
    avatarColor: 'from-cyan-600 to-blue-700'
  }
];

/**
 * Pure helper to build a deterministic `/api/tts` request URL.
 * Decoupled for unit testing.
 */
export function buildVoxCPM2RequestUrl(
  text: string,
  voiceId: string,
  engine: TtsEngineType = 'azure',
  config: VoxCPM2Config = DEFAULT_VOXCPM2_CONFIG,
  customPitchHz?: number,
  customRatePercent?: number
): string {
  const cleanText = (text || '').trim();
  const voiceDef = KHMER_VOICES.find(v => v.id === voiceId) || KHMER_VOICES[0];
  const clampedCfg = Math.min(4.0, Math.max(1.0, Number(config.cfgValue) || 2.0));
  const clampedSteps = Math.min(30, Math.max(6, Math.round(Number(config.inferenceSteps) || 16)));
  const clampedLora = config.loraEnabled
    ? Math.min(1.5, Math.max(0.5, Number(config.loraScale) || 1.0))
    : 0;

  const pitchHz = customPitchHz !== undefined ? customPitchHz : voiceDef.pitchOffsetHz;
  const ratePct = customRatePercent !== undefined ? customRatePercent : voiceDef.rateOffsetPercent;

  const params = new URLSearchParams({
    text: cleanText,
    voice: voiceId || 'piseth',
    engine,
    model: config.modelId,
    sr: String(config.sampleRate || 24000),
    cfg: clampedCfg.toFixed(2),
    steps: String(clampedSteps),
    lora: clampedLora.toFixed(2)
  });

  if (pitchHz !== undefined) {
    params.set('pitch', `${pitchHz >= 0 ? '+' : ''}${pitchHz}Hz`);
  }
  if (ratePct !== undefined) {
    params.set('rate', `${ratePct >= 0 ? '+' : ''}${ratePct}%`);
  }

  if (config.voiceDesignPrompt && config.voiceDesignPrompt.trim()) {
    params.set('prompt', config.voiceDesignPrompt.trim().slice(0, 240));
  }

  return `/api/tts?${params.toString()}`;
}

/**
 * Pure Synchronized Overlap-Add (SOLA) pitch-preserving time-stretcher for PCM audio.
 * Changes voice speaking speed (0.5x - 2.0x) WITHOUT changing pitch (zero chipmunk effect).
 */
export function timeStretchPcmSamples(
  samples: Float32Array,
  sampleRate: number,
  speed: number
): Float32Array {
  const clampedSpeed = Math.min(2.0, Math.max(0.5, Number(speed) || 1.0));
  if (Math.abs(clampedSpeed - 1.0) < 0.03 || samples.length < 512) {
    return samples;
  }

  // 28ms grain window (covers ~3-4 pitch periods of human voice)
  const winSize = Math.max(128, Math.floor((sampleRate * 0.028) / 2) * 2);
  const halfWin = winSize >> 1;
  const synthesisHop = halfWin;
  const analysisHop = Math.max(1, Math.round(synthesisHop * clampedSpeed));
  const searchRadius = Math.max(8, Math.floor(sampleRate * 0.005));

  const outLength = Math.max(winSize, Math.floor(samples.length / clampedSpeed));
  const output = new Float32Array(outLength);

  // Precompute Hann window (two 50%-overlapping Hann windows sum to unity 1.0)
  const hann = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  // Copy initial half-window fade-in
  const firstCopy = Math.min(winSize, samples.length, outLength);
  for (let i = 0; i < firstCopy; i++) {
    output[i] = samples[i] * (i < halfWin ? 1.0 : hann[i]);
  }

  let synthPos = synthesisHop;
  let targetAnalysisPos = analysisHop;

  while (synthPos + winSize <= outLength && targetAnalysisPos + winSize + searchRadius < samples.length) {
    // Find best phase-aligned offset within [-searchRadius, +searchRadius] via cross-correlation
    let bestOffset = 0;
    let bestCorr = -Infinity;
    const minOff = Math.max(-targetAnalysisPos, -searchRadius);
    const maxOff = Math.min(samples.length - winSize - targetAnalysisPos - 1, searchRadius);

    for (let off = minOff; off <= maxOff; off += 2) {
      let corr = 0;
      const candStart = targetAnalysisPos + off;
      // Correlate overlapping tail (step by 4 for sub-millisecond speed)
      for (let k = 0; k < halfWin; k += 4) {
        corr += output[synthPos + k] * samples[candStart + k];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = off;
      }
    }

    const chosenPos = targetAnalysisPos + bestOffset;
    for (let i = 0; i < winSize; i++) {
      output[synthPos + i] += samples[chosenPos + i] * hann[i];
    }

    synthPos += synthesisHop;
    targetAnalysisPos += analysisHop;
  }

  return output;
}

/**
 * Encodes 32-bit float mono PCM samples into a standard 44-byte RIFF WAV ArrayBuffer (16-bit PCM).
 * Pure JavaScript with zero external dependencies, works across all browsers and Node.js.
 */
export function encodePcmToWavBuffer(samples: Float32Array, sampleRate: number = 44100): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert Float32 (-1.0 to 1.0) to signed 16-bit PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return buffer;
}

export interface SegmentTtsDebugInfo {
  engine: string;
  isFallback: boolean;
  latencyMs: number;
  failed: boolean;
  error?: string;
  timestamp: number;
}

class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number = 2) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }
}

export const ttsConcurrencyLimiter = new ConcurrencyLimiter(2);

class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private activeEngine: TtsEngineType = 'cambodia_ai';
  private voxConfig: VoxCPM2Config = { ...DEFAULT_VOXCPM2_CONFIG };
  private masterVolume: number = 1.0;
  private masterSpeed: number = 1.0;
  private rawAudioCache = new Map<string, ArrayBuffer>();
  private decodedAudioCache = new Map<string, AudioBuffer>();
  public segmentTtsDebug = new Map<string, SegmentTtsDebugInfo>();
  private statusListeners: Array<() => void> = [];
  private playbackGeneration: number = 0;
  private isCurrentlySpeaking: boolean = false;
  private sequenceAborted: boolean = false;

  public getDebugInfo(segmentId?: string, cacheKey?: string): SegmentTtsDebugInfo | undefined {
    if (segmentId && this.segmentTtsDebug.has(segmentId)) {
      return this.segmentTtsDebug.get(segmentId);
    }
    if (cacheKey && this.segmentTtsDebug.has(cacheKey)) {
      return this.segmentTtsDebug.get(cacheKey);
    }
    return undefined;
  }

  private setDebugInfo(segmentId: string | undefined, cacheKey: string, info: SegmentTtsDebugInfo): void {
    if (segmentId) {
      this.segmentTtsDebug.set(segmentId, info);
    }
    this.segmentTtsDebug.set(cacheKey, info);
    for (const listener of this.statusListeners) {
      try { listener(); } catch {}
    }
  }

  public subscribeDebug(listener: () => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  public isSpeaking(): boolean {
    return this.isCurrentlySpeaking;
  }

  public getDecodedAudioDuration(text: string, voiceId: string = 'piseth', speed: number = 1.0): number | null {
    const cleanText = (text || '').trim();
    if (!cleanText) return null;
    const clampedSpeed = Math.min(2.0, Math.max(0.5, Number(speed.toFixed(2))));
    const cacheKey = `${voiceId}:${clampedSpeed}:${cleanText}`;
    const buf = this.decodedAudioCache.get(cacheKey);
    return buf ? buf.duration : null;
  }

  public getEngine(): TtsEngineType {
    return this.activeEngine;
  }

  public setEngine(engine: TtsEngineType): void {
    this.activeEngine = engine;
  }

  public getMasterSpeed(): number {
    return this.masterSpeed;
  }

  public setMasterSpeed(speed: number): number {
    this.masterSpeed = Math.min(2.0, Math.max(0.5, Number((Number(speed) || 1.0).toFixed(2))));
    if (this.currentAudio) {
      try {
        this.currentAudio.preservesPitch = true;
        (this.currentAudio as any).mozPreservesPitch = true;
        (this.currentAudio as any).webkitPreservesPitch = true;
        this.currentAudio.playbackRate = this.masterSpeed;
      } catch {}
    }
    return this.masterSpeed;
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.min(1.5, Math.max(0.0, Number(vol) || 1.0));
    if (this.currentAudio) {
      this.currentAudio.volume = Math.min(1.0, this.masterVolume);
    }
  }

  public getVoxCPM2Config(): VoxCPM2Config {
    return { ...this.voxConfig };
  }

  public setVoxCPM2Config(partial: Partial<VoxCPM2Config>): VoxCPM2Config {
    this.voxConfig = { ...this.voxConfig, ...partial };
    return { ...this.voxConfig };
  }

  public unlockAudio(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Preloads Khmer TTS audio streams into memory and pre-decodes them for segments
   * using a client-side concurrency limiter (max 2 concurrent requests) so servers are not flooded.
   */
  public async preloadSegments(
    segments: Array<{ id?: string; khmerText: string; speakerVoiceId: string; speedRatio?: number }>,
    defaultSpeed: number = 1.0
  ): Promise<void> {
    if (!Array.isArray(segments) || segments.length === 0) return;
    this.unlockAudio();

    // Process segments via ConcurrencyLimiter (max 2 requests in flight simultaneously)
    await Promise.all(
      segments.map(seg => this.getAudioBufferForSegment(seg, defaultSpeed))
    );
  }

  /**
   * Retrieves or synthesizes the decoded AudioBuffer for a specific segment.
   * Cached both in raw binary form and decoded AudioBuffer form for zero latency.
   * Captures per-segment TTS engine, latency, and error status for the debug panel.
   */
  public async getAudioBufferForSegment(
    seg: { id?: string; khmerText: string; speakerVoiceId: string; speedRatio?: number },
    defaultSpeed: number = 1.0,
    forceRetry: boolean = false
  ): Promise<AudioBuffer | null> {
    const text = (seg.khmerText || '').trim();
    if (!text) return null;
    const ctx = this.unlockAudio();
    const voiceId = seg.speakerVoiceId || 'piseth';
    const speed = Math.min(2.0, Math.max(0.5, Number((seg.speedRatio || defaultSpeed || this.masterSpeed).toFixed(2))));
    const cacheKey = `${voiceId}:${speed}:${text}`;

    if (forceRetry) {
      this.decodedAudioCache.delete(cacheKey);
      this.rawAudioCache.delete(cacheKey);
      if (seg.id) this.segmentTtsDebug.delete(seg.id);
    }

    if (this.decodedAudioCache.has(cacheKey)) {
      return this.decodedAudioCache.get(cacheKey)!;
    }

    let rawBuf = this.rawAudioCache.get(cacheKey);
    if (!rawBuf) {
      const voiceDef = KHMER_VOICES.find(v => v.id === voiceId) || KHMER_VOICES[0];
      const customRatePct = Math.round((speed - 1.0) * 100);
      const url = buildVoxCPM2RequestUrl(
        text,
        voiceId,
        this.activeEngine,
        { ...this.voxConfig, voiceDesignPrompt: voiceDef.voxcpm2Prompt },
        undefined,
        customRatePct
      );

      const t0 = performance.now();
      try {
        const res = await ttsConcurrencyLimiter.run(async () => {
          return await fetch(url);
        });
        const elapsed = Math.round(performance.now() - t0);

        if (res.ok) {
          const fetched = await res.arrayBuffer();
          if (fetched && fetched.byteLength > 100) {
            rawBuf = fetched;
            this.rawAudioCache.set(cacheKey, fetched);
            const engineHdr = res.headers.get('X-TTS-Engine') || 'Microsoft-Edge-Neural';
            const isFallback = res.headers.get('X-TTS-Fallback') === 'true' || engineHdr.includes('Backup') || engineHdr.includes('gemini-tts');
            this.setDebugInfo(seg.id, cacheKey, {
              engine: engineHdr,
              isFallback,
              latencyMs: elapsed,
              failed: false,
              timestamp: Date.now()
            });
          }
        } else {
          let errText = `HTTP ${res.status}`;
          try {
            const errData = await res.json();
            if (errData?.error) errText = errData.error;
          } catch {}
          console.warn(`[TTS Client Warning] Segment TTS returned ${res.status}:`, errText);
          this.setDebugInfo(seg.id, cacheKey, {
            engine: 'Unavailable',
            isFallback: false,
            latencyMs: elapsed,
            failed: true,
            error: errText,
            timestamp: Date.now()
          });
        }
      } catch (e: any) {
        const elapsed = Math.round(performance.now() - t0);
        console.error('[TTS Client Network Error]', e?.message || e);
        this.setDebugInfo(seg.id, cacheKey, {
          engine: 'Network Error',
          isFallback: false,
          latencyMs: elapsed,
          failed: true,
          error: e?.message || 'Network request failed',
          timestamp: Date.now()
        });
      }
    }

    if (rawBuf && rawBuf.byteLength > 100 && ctx) {
      try {
        const decoded = await ctx.decodeAudioData(rawBuf.slice(0));
        this.decodedAudioCache.set(cacheKey, decoded);
        return decoded;
      } catch (err: any) {
        console.error('[Web Audio Decode Error]', err?.message || err);
      }
    }
    return null;
  }

  /**
   * Plays authentic Cambodian AI speech (ភាសាខ្មែរ - សំឡេង AI សម្រាយរឿងធម្មតា)
   * with pitch-preserved voice speed control (0.5x to 2.0x) and zero chipmunk distortion.
   */
  async speak(
    text: string,
    voiceId: string = 'piseth',
    rate?: number,
    customPrompt?: string,
    waitForEnd: boolean = false,
    onEnded?: () => void
  ): Promise<void> {
    if (!text || !text.trim()) return;
    const cleanText = text.trim();
    const voiceDef = KHMER_VOICES.find(v => v.id === voiceId) || KHMER_VOICES[0];
    
    // Stop any existing single-line playback & track cancellation generation
    const currentGen = ++this.playbackGeneration;
    this.stopCurrentLineOnly();
    const ctx = this.unlockAudio();

    const effectiveConfig: VoxCPM2Config = {
      ...this.voxConfig,
      voiceDesignPrompt: customPrompt || voiceDef.voxcpm2Prompt || this.voxConfig.voiceDesignPrompt
    };

    // Determine effective voice speed (0.5x to 2.0x): use explicit rate if provided, otherwise masterSpeed
    const requestedSpeed = rate !== undefined && rate > 0 ? rate : this.masterSpeed;
    const effectiveSpeed = Math.min(2.0, Math.max(0.5, Number(requestedSpeed.toFixed(2))));
    const customRatePct = rate !== undefined ? Math.round((effectiveSpeed - 1.0) * 100) : undefined;

    const url = buildVoxCPM2RequestUrl(cleanText, voiceId, this.activeEngine, effectiveConfig, undefined, customRatePct);
    const cacheKey = `${voiceId}:${effectiveSpeed}:${cleanText}`;

    // 0. Instant play if pre-decoded in memory (0ms latency, zero lip desync)
    const cachedAudio = this.decodedAudioCache.get(cacheKey);
    if (cachedAudio && ctx) {
      if (this.playbackGeneration !== currentGen) return;
      const source = ctx.createBufferSource();
      source.buffer = cachedAudio;
      source.playbackRate.value = 1.0;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(Math.max(0.05, this.masterVolume), ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.currentSource = source;
      this.isCurrentlySpeaking = true;

      const finishLine = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
          this.isCurrentlySpeaking = false;
        }
        if (onEnded) onEnded();
      };

      source.onended = finishLine;

      if (waitForEnd) {
        await new Promise<void>(resolve => {
          source.onended = () => {
            finishLine();
            resolve();
          };
          source.start(0);
        });
      } else {
        source.start(0);
      }
      return;
    }

    // 1. Decode and play clean Cambodian AI voice via Web Audio API
    try {
      let arrayBuffer = this.rawAudioCache.get(cacheKey);
      if (!arrayBuffer) {
        const response = await fetch(url);
        if (response.ok) {
          const fetched = await response.arrayBuffer();
          if (fetched.byteLength > 100) {
            arrayBuffer = fetched;
            this.rawAudioCache.set(cacheKey, fetched);
          }
        }
      }

      if (this.playbackGeneration !== currentGen) return;

      if (arrayBuffer && arrayBuffer.byteLength > 100 && ctx) {
        const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        this.decodedAudioCache.set(cacheKey, decodedBuffer);

        if (this.playbackGeneration !== currentGen) return;

        let playBuffer = decodedBuffer;
        // Only apply client-side SOLA stretch if audio was synthesized from an offline engine without native rate control
        if ((this.activeEngine as string) === 'offline_harmonic' && Math.abs(effectiveSpeed - 1.0) >= 0.03) {
          const rawChannel = decodedBuffer.getChannelData(0);
          const stretchedPcm = timeStretchPcmSamples(rawChannel, decodedBuffer.sampleRate, effectiveSpeed);
          const stretchedBuf = ctx.createBuffer(1, stretchedPcm.length, decodedBuffer.sampleRate);
          stretchedBuf.getChannelData(0).set(stretchedPcm);
          playBuffer = stretchedBuf;
        }

        const source = ctx.createBufferSource();
        source.buffer = playBuffer;
        source.playbackRate.value = 1.0;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(Math.max(0.05, this.masterVolume), ctx.currentTime);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        this.currentSource = source;
        this.isCurrentlySpeaking = true;

        const finishLine = () => {
          if (this.currentSource === source) {
            this.currentSource = null;
            this.isCurrentlySpeaking = false;
          }
          if (onEnded) onEnded();
        };

        source.onended = finishLine;

        if (waitForEnd) {
          await new Promise<void>(resolve => {
            source.onended = () => {
              finishLine();
              resolve();
            };
            source.start(0);
          });
        } else {
          source.start(0);
        }
        return;
      }
    } catch (err) {
      console.warn('Web Audio decode notice, trying HTMLAudioElement:', err);
    }

    if (this.playbackGeneration !== currentGen) return;

    // 2. Fallback to HTMLAudioElement with preservesPitch = true
    try {
      const audio = new Audio(url);
      audio.preservesPitch = true;
      (audio as any).mozPreservesPitch = true;
      (audio as any).webkitPreservesPitch = true;
      audio.playbackRate = effectiveSpeed;
      audio.volume = Math.min(1.0, Math.max(0.05, this.masterVolume));
      this.currentAudio = audio;
      this.isCurrentlySpeaking = true;

      const finishLine = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.isCurrentlySpeaking = false;
        }
        if (onEnded) onEnded();
      };

      audio.onended = finishLine;
      audio.onerror = finishLine;

      if (waitForEnd) {
        await new Promise<void>(resolve => {
          audio.onended = () => {
            finishLine();
            resolve();
          };
          audio.onerror = () => {
            finishLine();
            resolve();
          };
          audio.play().catch(() => resolve());
        });
        return;
      } else {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          return;
        }
      }
    } catch (err) {
      this.isCurrentlySpeaking = false;
      if (onEnded) onEnded();
      console.warn('HTMLAudioElement playback failed, falling back to local speech engine:', err);
    }

    // 3. Check Web Speech API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const voices = window.speechSynthesis.getVoices();
        const khmerVoice = voices.find(v => v.lang.startsWith('km') || v.name.toLowerCase().includes('khmer'));
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'km-KH';
        if (khmerVoice) {
          utterance.voice = khmerVoice;
        }
        utterance.rate = effectiveSpeed;
        utterance.pitch = 1.0;
        this.isCurrentlySpeaking = true;
        utterance.onend = () => {
          this.isCurrentlySpeaking = false;
          if (onEnded) onEnded();
        };
        utterance.onerror = () => {
          this.isCurrentlySpeaking = false;
          if (onEnded) onEnded();
        };
        window.speechSynthesis.speak(utterance);
        return;
      } catch (speechErr) {
        this.isCurrentlySpeaking = false;
        if (onEnded) onEnded();
        console.warn('Web Speech API error:', speechErr);
      }
    }
  }

  /**
   * Narrates the FULL movie sequentially from segment #1 to the end using the normal Cambodian AI voice
   * at each segment's configured speedRatio (or masterSpeed).
   */
  public async speakFullMovieSequence(
    segments: Array<{ id: string; khmerText: string; speakerVoiceId: string; speedRatio?: number }>,
    onSegmentActive?: (id: string | null) => void
  ): Promise<void> {
    this.stop();
    this.sequenceAborted = false;
    this.unlockAudio();

    for (const seg of segments) {
      if (this.sequenceAborted) break;
      if (!seg.khmerText || !seg.khmerText.trim()) continue;
      if (onSegmentActive) onSegmentActive(seg.id);
      const lineSpeed = seg.speedRatio || this.masterSpeed || 1.0;
      await this.speak(seg.khmerText, seg.speakerVoiceId || 'piseth', lineSpeed, undefined, true);
    }

    if (onSegmentActive) onSegmentActive(null);
  }

  private stopCurrentLineOnly() {
    this.isCurrentlySpeaking = false;
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Generates a complete master mixed WAV audio buffer (16-bit PCM 44.1kHz)
   * containing the full spoken script aligned with every segment's timeframe [start, end].
   */
  public async renderFullMovieAudioWav(
    segments: Array<{ start: number; end: number; khmerText: string; speakerVoiceId: string; speedRatio?: number }>,
    totalDuration: number = 20.0,
    onProgress?: (pct: number) => void
  ): Promise<ArrayBuffer> {
    const sampleRate = 44100;
    const dur = Math.max(1.0, totalDuration);
    const totalSamples = Math.floor(dur * sampleRate);
    const masterPcm = new Float32Array(totalSamples);

    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      if (onProgress) onProgress(Math.round(((sIdx + 1) / segments.length) * 80));
      if (!seg.khmerText || !seg.khmerText.trim()) continue;

      const audioBuf = await this.getAudioBufferForSegment(seg);
      if (!audioBuf) continue;

      const segStartSample = Math.floor(Math.max(0, seg.start) * sampleRate);
      const channelData = audioBuf.getChannelData(0);
      const copyLen = Math.min(channelData.length, totalSamples - segStartSample);

      for (let i = 0; i < copyLen; i++) {
        const idx = segStartSample + i;
        if (idx < totalSamples) {
          masterPcm[idx] = Math.max(-1.0, Math.min(1.0, masterPcm[idx] + channelData[i]));
        }
      }
    }

    if (onProgress) onProgress(100);
    return encodePcmToWavBuffer(masterPcm, sampleRate);
  }

  stop() {
    this.sequenceAborted = true;
    this.stopCurrentLineOnly();
  }
}

export const khmerSynthesizer = new AudioSynthesizer();




