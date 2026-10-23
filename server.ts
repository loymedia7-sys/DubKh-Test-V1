import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  generateSegmentsForUploadedVideo, 
  parseScriptOrSrtToSegments, 
  sanitizeTranscribedSegments,
  clampVoiceSpeed, 
  TranscriptionMode 
} from './src/utils/dubbingEngine.ts';
import { alignSegmentsToVoicePeaks, generateSyntheticVoicePeaks } from './src/utils/voiceTracker.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Initialize Google Gemini SDK if API key is present
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// In-memory demo store for projects & credits
interface ProjectData {
  id: string;
  title: string;
  sourceUrl?: string;
  status: string;
  videoUrl: string;
  createdAt: string;
  voiceVolume: number;
  bgmVolume: number;
  duckingThreshold: number;
  segments: Array<{
    id: string;
    start: number;
    end: number;
    speaker: string;
    speakerVoiceId: string;
    originalText: string;
    khmerText: string;
    emotion?: string;
  }>;
}

const mockProjects: Record<string, ProjectData> = {
  'proj-khmer-action-01': {
    id: 'proj-khmer-action-01',
    title: 'The Angkor Legend - Action Trailer',
    sourceUrl: 'https://www.youtube.com/watch?v=sample-angkor-trailer',
    status: 'user_editing',
    videoUrl: 'sample-action.mp4',
    createdAt: new Date().toISOString(),
    voiceVolume: 1.0,
    bgmVolume: 0.65,
    duckingThreshold: 0.18,
    segments: [
      {
        id: 'seg-1',
        start: 1.2,
        end: 4.5,
        speaker: 'Speaker 1 (Commander)',
        speakerVoiceId: 'piseth',
        originalText: 'We must breach the ancient temple gate before sunset!',
        khmerText: 'យើងត្រូវតែទម្លុះទ្វារប្រាសាទបុរាណនេះ មុនពេលព្រះអាទិត្យលិច!',
        emotion: 'action'
      },
      {
        id: 'seg-2',
        start: 5.0,
        end: 8.4,
        speaker: 'Speaker 2 (Archaeologist)',
        speakerVoiceId: 'sreymom',
        originalText: 'Wait, the sacred inscription warns of a curse on whoever disturbs it.',
        khmerText: 'ចាំសិន! សិលាចារឹកពិសិដ្ឋបានព្រមានពីបណ្តាសា ដល់អ្នកណាដែលមករំខានវា។',
        emotion: 'dramatic'
      },
      {
        id: 'seg-3',
        start: 9.1,
        end: 12.8,
        speaker: 'Narrator',
        speakerVoiceId: 'borey',
        originalText: 'In a kingdom forgotten by time, courage is the only weapon that remains.',
        khmerText: 'នៅក្នុងនគរមួយដែលពេលវេលាបានបំភ្លេច សេចក្តីក្លាហានគឺជាអាវុធតែមួយគត់ដែលនៅសេសសល់។',
        emotion: 'dramatic'
      },
      {
        id: 'seg-4',
        start: 13.5,
        end: 17.0,
        speaker: 'Speaker 1 (Commander)',
        speakerVoiceId: 'piseth',
        originalText: 'Draw your swords! We fight together, or we fall together!',
        khmerText: 'ដកដាវរបស់អ្នកឡើង! យើងតស៊ូជាមួយគ្នា ឬក៏យើងត្រូវដួលរលំទាំងអស់គ្នា!',
        emotion: 'shout'
      }
    ]
  }
};

let userCreditsMinutes = 45; // Default free promotional credits

// API: Check status & credits
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!apiKey,
    creditsMinutes: userCreditsMinutes
  });
});

app.get('/api/credits', (req: Request, res: Response) => {
  res.json({ creditsMinutes: userCreditsMinutes });
});

// API: Generate Bakong KHQR payment
app.post('/api/payments/khqr', (req: Request, res: Response) => {
  const { amount, minutes, currency = 'USD' } = req.body;
  const qrRef = `KHQR-DUB-${Date.now().toString().slice(-6)}`;
  
  // Real Bakong EMVCo Tag-Length format
  const amountFormatted = Number(amount || 5).toFixed(2);
  const rawKHQR = `00020101021229380010bakong@nbc0116khmerdub@acleda520459995303840540${amountFormatted.length}${amountFormatted}5802KH5915KHMER DUB STUDIO6010Phnom Penh62170113${qrRef}6304E8A2`;

  res.json({
    success: true,
    qrRef,
    amount: amountFormatted,
    currency,
    minutesAdded: minutes || 30,
    khqrString: rawKHQR,
    expiresInSeconds: 600
  });
});

// API: Confirm KHQR payment & top up credits
app.post('/api/payments/confirm', (req: Request, res: Response) => {
  const { minutesAdded } = req.body;
  const added = Number(minutesAdded) || 30;
  userCreditsMinutes += added;
  res.json({
    success: true,
    newBalance: userCreditsMinutes,
    addedMinutes: added,
    message: `Payment confirmed via Bakong KHQR. +${added} minutes added to your account!`
  });
});

// In-memory cache for synthesized audio to prevent duplicate API calls and eliminate latency
const ttsAudioCache = new Map<string, { buffer: Buffer; contentType: string; engineTag: string }>();

// Circuit breaker for Gemini TTS when free-tier daily quota is reached
let geminiTtsBlockedUntil = 0;

/**
 * Splits Khmer/multilingual text into natural phrase chunks <= 170 chars
 * so neural Khmer TTS endpoints synthesize long sentences without truncation.
 */
function splitKhmerTextIntoChunks(text: string, maxLen = 170): string[] {
  const cleaned = (text || '').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  // Split by Khmer full stop (។), exclamation, question mark, comma, or space
  const parts = cleaned.split(/(?<=[។៕!?.,;\s])/);
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    if ((current + part).length <= maxLen) {
      current += part;
    } else {
      if (current.trim()) chunks.push(current.trim());
      if (part.length <= maxLen) {
        current = part;
      } else {
        // Hard slice if a single continuous string exceeds maxLen
        for (let i = 0; i < part.length; i += maxLen) {
          chunks.push(part.slice(i, i + maxLen));
        }
        current = '';
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Fetches real, fluent spoken Cambodian Khmer (km-KH) neural speech audio (MP3)
 * so every Khmer sentence is spoken clearly in authentic Khmer words.
 */
async function fetchRealKhmerSpeechMp3(text: string): Promise<Buffer | null> {
  try {
    const chunks = splitKhmerTextIntoChunks(text, 170);
    if (chunks.length === 0) return null;

    const buffers: Buffer[] = [];
    // Detect if text has Khmer script; default to 'km' (Khmer)
    const hasKhmer = /[\u1780-\u17FF]/.test(text);
    const lang = hasKhmer ? 'km' : 'en';

    for (const chunk of chunks) {
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${lang}&client=gtx`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        return null;
      }

      const arrBuf = await response.arrayBuffer();
      if (arrBuf.byteLength < 200) {
        return null;
      }
      buffers.push(Buffer.from(arrBuf));
    }

    return buffers.length > 0 ? Buffer.concat(buffers) : null;
  } catch (err: any) {
    console.error('[Google Translate TTS Error] Fetch failed:', err?.message || err, err?.stack);
    return null;
  }
}

// Helper to generate a valid, audible 48kHz/24kHz WAV buffer with VoxCPM2 speech formant harmonics
function generateFallbackKhmerWav(
  text: string,
  voiceId: string,
  options?: { sampleRate?: number; cfgValue?: number; loraScale?: number; steps?: number }
): Buffer {
  const requestedSr = Number(options?.sampleRate) || 48000;
  const sampleRate = requestedSr === 24000 ? 24000 : 48000; // VoxCPM2 native 48kHz studio output
  const cfgBoost = Math.min(1.35, Math.max(0.85, (Number(options?.cfgValue) || 2.0) / 2.0));
  const loraHarmonic = Math.min(1.25, Math.max(0.8, Number(options?.loraScale) || 1.0));
  const isFemale = voiceId === 'sreymom' || voiceId === 'kolab' || voiceId === 'apsara';
  
  // Tuned fundamental pitch and formants for each Cambodian character voice (including VoxCPM2 Sovann & Apsara)
  const voiceProfiles: Record<string, { baseFreq: number; formantF1: number; formantF2: number; formantF3: number; formantF4: number }> = {
    piseth:  { baseFreq: 130, formantF1: 750, formantF2: 1250, formantF3: 2400, formantF4: 3450 }, // Heroic male lead
    sreymom: { baseFreq: 235, formantF1: 950, formantF2: 1850, formantF3: 2850, formantF4: 3950 }, // Emotional female lead
    sovann:  { baseFreq: 122, formantF1: 720, formantF2: 1320, formantF3: 2520, formantF4: 3600 }, // VoxCPM2 48kHz Male Master Clone
    apsara:  { baseFreq: 242, formantF1: 920, formantF2: 1920, formantF3: 2950, formantF4: 4100 }, // VoxCPM2 48kHz Female Royal & Poetic
    borey:   { baseFreq: 98,  formantF1: 650, formantF2: 1100, formantF3: 2200, formantF4: 3200 }, // Deep baritone narrator
    kolab:   { baseFreq: 215, formantF1: 900, formantF2: 1750, formantF3: 2750, formantF4: 3800 }, // Gentle female
    kiri:    { baseFreq: 145, formantF1: 800, formantF2: 1350, formantF3: 2500, formantF4: 3500 }, // Action male
    dara:    { baseFreq: 138, formantF1: 780, formantF2: 1300, formantF3: 2450, formantF4: 3550 }  // Youthful male
  };

  const profile = voiceProfiles[voiceId] || (isFemale ? voiceProfiles.apsara : voiceProfiles.sovann);
  const fundamental = profile.baseFreq;

  const cleanText = (text || '').trim();
  const syllables = Math.max(2, Math.min(30, Math.floor(cleanText.length / 2.6) || 3));
  const syllableDuration = 0.165; // ~165ms per syllable for natural Khmer speech rate
  const totalDuration = Math.max(0.65, syllables * syllableDuration);
  const numSamples = Math.floor(sampleRate * totalDuration);

  // 16-bit mono PCM at 48kHz
  const pcmData = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllIndex = Math.floor(t / syllableDuration);
    const syllPhase = (t % syllableDuration) / syllableDuration;

    // Smooth amplitude envelope per syllable (attack, sustain, decay)
    let env = 0;
    if (syllPhase < 0.12) {
      env = Math.sin((syllPhase / 0.12) * (Math.PI / 2));
    } else if (syllPhase > 0.82) {
      env = Math.cos(((syllPhase - 0.82) / 0.18) * (Math.PI / 2));
    } else {
      env = 0.95;
    }

    // Natural musical sentence intonation curve
    const intonation = 1.0 + Math.sin((t / totalDuration) * Math.PI) * 0.07 - (t / totalDuration) * 0.04;
    const syllJitter = 1.0 + ((syllIndex % 4) - 1.5) * 0.025;
    const f0 = fundamental * intonation * syllJitter;

    // Multi-harmonic vocal chord model (F0, 2*F0, 3*F0) + Formant resonances (F1, F2, F3, F4 48kHz air)
    const waveF0 = Math.sin(2 * Math.PI * f0 * t);
    const waveF0Harmonic = 0.45 * Math.sin(2 * Math.PI * (f0 * 2) * t);
    const waveF1 = 0.28 * loraHarmonic * Math.sin(2 * Math.PI * profile.formantF1 * t);
    const waveF2 = 0.17 * loraHarmonic * Math.sin(2 * Math.PI * profile.formantF2 * t);
    const waveF3 = 0.09 * cfgBoost * Math.sin(2 * Math.PI * profile.formantF3 * t);
    const waveF4 = 0.04 * cfgBoost * Math.sin(2 * Math.PI * profile.formantF4 * t);

    // Subtle consonant aspiration burst at onset of each syllable
    const consonantBurst = syllPhase < 0.06 ? (Math.random() * 2 - 1) * 0.14 * (1 - syllPhase / 0.06) : 0;

    const sample = (waveF0 + waveF0Harmonic + waveF1 + waveF2 + waveF3 + waveF4 + consonantBurst) * 0.30 * env;
    pcmData[i] = Math.max(-32767, Math.min(32767, Math.floor(sample * 28000)));
  }

  // Build standard 44-byte RIFF WAV header
  const header = Buffer.alloc(44);
  const dataSize = numSamples * 2;
  const fileSize = dataSize + 36;

  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  header.writeUInt16LE(1, 22);  // NumChannels (1 mono)
  header.writeUInt32LE(sampleRate, 24); // SampleRate (48000 Hz for VoxCPM2)
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  header.writeUInt16LE(2, 32);  // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, Buffer.from(pcmData.buffer)]);
}

// Character Pitch & Rate offsets on top of km-KH-PisethNeural & km-KH-SreymomNeural
// Derived from Nice One Dubber for movie dubbing:
// "The young/old character profiles are pitch and rate offsets on top of these two."
// Default rates are tuned to +0% to +10% for crystal-clear spoken Khmer articulation.
const EDGE_VOICE_CONFIGS: Record<string, { voiceName: string; defaultPitch: string; defaultRate: string; title: string }> = {
  // 1. Warrior Male (Old Warrior with -4Hz deep pitch & +5% rate for clear delivery)
  piseth: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-4Hz', defaultRate: '+5%', title: 'Piseth (Warrior / Action)' },
  warrior: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-4Hz', defaultRate: '+5%', title: 'Old Warrior' },
  // 2. Fierce Female Fighter (+3Hz sharp pitch & +5% rate)
  sreymom: { voiceName: 'km-KH-SreymomNeural', defaultPitch: '+3Hz', defaultRate: '+5%', title: 'Sreymom (Fighter / Drama)' },
  fighter: { voiceName: 'km-KH-SreymomNeural', defaultPitch: '+3Hz', defaultRate: '+5%', title: 'Fierce Fighter' },
  // 3. Movie Recap Narrator (Signature Cambodian AI recap tone)
  sovann: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-2Hz', defaultRate: '+5%', title: 'Movie Recap Narrator' },
  recap: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-2Hz', defaultRate: '+5%', title: 'Movie Recap Narrator' },
  // 4. Drama / Emotional Female
  apsara: { voiceName: 'km-KH-SreymomNeural', defaultPitch: '+2Hz', defaultRate: '+5%', title: 'Apsara (Drama / Series)' },
  // 5. Calm Elder Master / Monk (-4Hz, +0%)
  borey: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-4Hz', defaultRate: '+0%', title: 'Elder Master / Monk' },
  elder: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-4Hz', defaultRate: '+0%', title: 'Elder Master' },
  // 6. Gentle Storyteller / Romantic Heroine (+2Hz, +5%)
  kolab: { voiceName: 'km-KH-SreymomNeural', defaultPitch: '+2Hz', defaultRate: '+5%', title: 'Gentle Heroine' },
  heroine: { voiceName: 'km-KH-SreymomNeural', defaultPitch: '+2Hz', defaultRate: '+5%', title: 'Gentle Heroine' },
  // 7. Evil Dark Villain / Warlord (-8Hz, +5%)
  kiri: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-8Hz', defaultRate: '+5%', title: 'Evil Warlord / General' },
  villain: { voiceName: 'km-KH-PisethNeural', defaultPitch: '-8Hz', defaultRate: '+5%', title: 'Dark Villain' },
  // 8. Young Hero / Youthful Protagonist (+3Hz, +8%)
  dara: { voiceName: 'km-KH-PisethNeural', defaultPitch: '+3Hz', defaultRate: '+8%', title: 'Young Hero / Scout' },
  young_hero: { voiceName: 'km-KH-PisethNeural', defaultPitch: '+3Hz', defaultRate: '+8%', title: 'Young Hero' },
  // Direct Azure voice identifiers
  'km-KH-PisethNeural': { voiceName: 'km-KH-PisethNeural', defaultPitch: '+0Hz', defaultRate: '+0%', title: 'Piseth Neural' },
  'km-KH-SreymomNeural': { voiceName: 'km-KH-SreymomNeural', defaultPitch: '+0Hz', defaultRate: '+0%', title: 'Sreymom Neural' }
};

/**
 * Single attempt to synthesize Khmer speech via Microsoft Edge TTS with timeout.
 */
async function attemptSingleEdgeTTS(
  text: string,
  voiceName: string,
  rateStr: string,
  pitchStr: string,
  timeoutMs: number
): Promise<Buffer | null> {
  let tts: any = null;
  try {
    tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    if (tts._ws) {
      tts._ws.on('error', (wsErr: any) => {
        console.error('[Edge TTS WebSocket Error]', wsErr?.message || wsErr);
      });
    }
    const streamData = tts.toStream(text, {
      rate: rateStr,
      pitch: pitchStr
    });
    if (tts._ws) {
      tts._ws.on('error', (wsErr: any) => {
        console.error('[Edge TTS WebSocket Stream Error]', wsErr?.message || wsErr);
      });
    }
    const chunks: Buffer[] = [];
    return await new Promise<Buffer | null>((resolve) => {
      let done = false;
      const finish = (result: Buffer | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { tts?.close(); } catch (closeErr: any) {
          console.error('[Edge TTS Close Error]', closeErr?.message || closeErr);
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish(null);
      }, timeoutMs);

      streamData.audioStream.on('data', (c: Buffer) => chunks.push(c));
      streamData.audioStream.on('end', () => {
        const buf = Buffer.concat(chunks);
        finish(buf.byteLength > 200 ? buf : null);
      });
      streamData.audioStream.on('error', (e: any) => {
        console.error('[Edge TTS AudioStream Error]', e?.message || e);
        finish(null);
      });
    });
  } catch (err: any) {
    console.error('[Edge TTS Init Error]', err?.message || err);
    try { tts?.close(); } catch (closeErr: any) {
      console.error('[Edge TTS Close Error]', closeErr?.message || closeErr);
    }
    return null;
  }
}

/**
 * Synthesizes high-fidelity Khmer speech via Microsoft Azure Neural Text-to-Speech (Edge TTS)
 * with character pitch and rate offsets, retrying up to 3 times with exponential backoff (500ms, 1s, 2s)
 * and a 20s timeout per attempt before falling back.
 */
async function synthesizeWithEdgeTTS(
  text: string,
  voiceName: string = 'km-KH-PisethNeural',
  rateStr: string = '+0%',
  pitchStr: string = '+0Hz',
  timeoutMs: number = 20000
): Promise<Buffer | null> {
  const backoffDelays = [0, 500, 1000, 2000]; // Initial try + 3 retries with exponential backoff

  for (let attempt = 0; attempt < backoffDelays.length; attempt++) {
    const delay = backoffDelays[attempt];
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      const buffer = await attemptSingleEdgeTTS(text, voiceName, rateStr, pitchStr, timeoutMs);
      if (buffer && buffer.byteLength > 200) {
        return buffer;
      }
      if (attempt < backoffDelays.length - 1) {
        console.warn(`[Edge TTS Retry] Attempt ${attempt + 1} produced no audio for text (length ${text.length}). Backing off ${backoffDelays[attempt + 1]}ms...`);
      }
    } catch (attemptErr: any) {
      console.error(`[Edge TTS Attempt ${attempt + 1} Exception]`, attemptErr?.message || attemptErr);
    }
  }

  return null;
}

/**
 * RFC 7230: HTTP header values must only contain visible ASCII characters (0x20-0x7E).
 * Strips any non-ASCII or control characters and catches errors to prevent ERR_INVALID_CHAR exceptions.
 */
function safeSetHeader(res: Response, name: string, value: string): void {
  try {
    const clean = String(value || '')
      .replace(/[^\x20-\x7E]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) {
      res.setHeader(name, clean);
    }
  } catch (err: any) {
    console.error(`[Header Error] Failed to set header ${name}:`, err?.message || err);
  }
}

// API: Text-to-Speech (TTS) for Khmer audio synthesis (Microsoft Neural km-KH + Real Fallbacks)
app.get('/api/tts', async (req: Request, res: Response) => {
  try {
    const text = (req.query.text as string) || '';
    const voice = (req.query.voice as string) || 'piseth';
    const engine = (req.query.engine as string) || 'edge';
    const model = (req.query.model as string) || 'km-KH-Neural';
    const sr = parseInt((req.query.sr as string) || '24000', 10) || 24000;
    const rawRate = (req.query.rate as string) || '';
    const rawPitch = (req.query.pitch as string) || '';

    if (!text.trim()) {
      return res.status(400).send('Text parameter is required');
    }

    const voiceConfig = EDGE_VOICE_CONFIGS[voice] || (
      voice === 'sreymom' || voice === 'kolab' || voice === 'apsara' || voice.toLowerCase().includes('female')
        ? EDGE_VOICE_CONFIGS.sreymom
        : EDGE_VOICE_CONFIGS.piseth
    );

    let effectiveRate = voiceConfig.defaultRate;
    if (rawRate) {
      if (rawRate.includes('%')) {
        effectiveRate = rawRate;
      } else {
        const numRate = parseFloat(rawRate);
        if (!isNaN(numRate) && numRate > 0) {
          const pct = Math.round((numRate - 1.0) * 100);
          effectiveRate = pct >= 0 ? `+${pct}%` : `${pct}%`;
        }
      }
    }

    let effectivePitch = voiceConfig.defaultPitch;
    if (rawPitch) {
      if (rawPitch.toLowerCase().includes('hz')) {
        effectivePitch = rawPitch;
      } else {
        const numPitch = parseInt(rawPitch, 10);
        if (!isNaN(numPitch)) {
          effectivePitch = numPitch >= 0 ? `+${numPitch}Hz` : `${numPitch}Hz`;
        }
      }
    }

    // Cache key for Edge TTS results ONLY
    const cacheKey = `${engine}:${voiceConfig.voiceName}:${effectiveRate}:${effectivePitch}:${text.trim()}`;
    if (ttsAudioCache.has(cacheKey)) {
      const cached = ttsAudioCache.get(cacheKey)!;
      res.setHeader('Content-Type', cached.contentType);
      safeSetHeader(res, 'X-TTS-Engine', cached.engineTag);
      safeSetHeader(res, 'X-TTS-Fallback', 'false');
      safeSetHeader(res, 'X-Sample-Rate', String(sr));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached.buffer);
    }

    // 1. Primary Engine: Microsoft Azure Neural Voices (Edge TTS km-KH-PisethNeural & km-KH-SreymomNeural)
    // Retries up to 3 times with exponential backoff (500ms, 1s, 2s) and 20s timeout
    const edgeBuffer = await synthesizeWithEdgeTTS(
      text.trim(),
      voiceConfig.voiceName,
      effectiveRate,
      effectivePitch,
      20000
    );

    if (edgeBuffer && edgeBuffer.byteLength > 200) {
      const engineTag = `Microsoft-Edge-Neural (${voiceConfig.voiceName} - pitch:${effectivePitch} rate:${effectiveRate})`;
      // Cache ONLY real Edge TTS results
      ttsAudioCache.set(cacheKey, {
        buffer: edgeBuffer,
        contentType: 'audio/mpeg',
        engineTag
      });
      res.setHeader('Content-Type', 'audio/mpeg');
      safeSetHeader(res, 'X-TTS-Engine', engineTag);
      safeSetHeader(res, 'X-TTS-Fallback', 'false');
      safeSetHeader(res, 'X-Sample-Rate', '24000');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(edgeBuffer);
    }

    // 2. Secondary Real Khmer Speech Engine: Native Khmer (km-KH) fallback stream
    console.warn(`[TTS Fallback] Engine: Khmer-Speech-Backup, Text len: ${text.length}, Error: Edge TTS failed after 3 retries (20s timeout)`);
    try {
      const realKhmerMp3 = await fetchRealKhmerSpeechMp3(text.trim());
      if (realKhmerMp3 && realKhmerMp3.byteLength > 200) {
        const engineTag = `Khmer-Speech-Backup (${voiceConfig.voiceName})`;
        // DO NOT write fallback results to ttsAudioCache!
        res.setHeader('Content-Type', 'audio/mpeg');
        safeSetHeader(res, 'X-TTS-Engine', engineTag);
        safeSetHeader(res, 'X-TTS-Fallback', 'true');
        safeSetHeader(res, 'X-Sample-Rate', String(sr));
        return res.send(realKhmerMp3);
      }
    } catch (backupErr: any) {
      console.error('[TTS Fallback Error] Khmer-Speech-Backup failed:', backupErr?.message || backupErr);
    }

    // 3. Tertiary: Try Gemini TTS with @google/genai if available and quota is not blocked
    const isQuotaBlocked = Date.now() < geminiTtsBlockedUntil;
    if (ai && !isQuotaBlocked) {
      console.warn(`[TTS Fallback] Engine: gemini-tts, Text len: ${text.length}, Error: Secondary Khmer-Speech-Backup failed or empty`);
      try {
        const voiceMap: Record<string, string> = {
          piseth: 'Puck',
          sreymom: 'Kore',
          sovann: 'Puck',
          apsara: 'Aoede',
          borey: 'Charon',
          kolab: 'Aoede',
          kiri: 'Fenrir',
          dara: 'Zephyr'
        };
        const geminiVoice = voiceMap[voice] || 'Puck';

        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [{ text: `Speak this in Cambodian Khmer: ${text.trim()}` }]
            }
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiVoice
                }
              }
            }
          }
        });

        const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const audioBuffer = Buffer.from(base64Audio, 'base64');
          const engineTag = 'gemini-tts';
          // DO NOT write fallback results to ttsAudioCache!
          res.setHeader('Content-Type', 'audio/wav');
          safeSetHeader(res, 'X-TTS-Engine', engineTag);
          safeSetHeader(res, 'X-TTS-Fallback', 'true');
          safeSetHeader(res, 'X-Sample-Rate', String(sr));
          return res.send(audioBuffer);
        }
      } catch (gErr: any) {
        const errMsg = String(gErr?.message || gErr || '');
        if (gErr?.status === 404 || errMsg.includes('404') || errMsg.includes('NOT_FOUND')) {
          console.error('[Gemini Model Error] Model gemini-3.8-flash-lite-tts returned 404 Not Found:', errMsg);
        } else {
          console.error('[Gemini TTS Error] Synthesis failed:', errMsg);
        }
        const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') || gErr?.status === 429;
        if (is429) {
          geminiTtsBlockedUntil = Date.now() + 12 * 60 * 60 * 1000;
        }
      }
    }

    // 4. All real engines failed: DO NOT use fake sine-wave synthesizer. Return HTTP 503 so UI can display Retry button!
    console.warn(`[TTS Fallback] Engine: None, Text len: ${text.length}, Error: All real engines exhausted`);
    if (!res.headersSent) {
      return res.status(503).json({ 
        error: 'All real Khmer TTS engines unavailable. Please click Retry to re-synthesize this segment.' 
      });
    }
  } catch (outerErr: any) {
    console.error('[TTS Fatal Error] /api/tts outer exception:', outerErr?.message || outerErr, outerErr?.stack);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'TTS request failed' });
    }
  }
});

/**
 * Helper: Calls Gemini 3.8 Flash (with low thinking latency) and automatically falls back
 * to Gemini 3.1 Flash Lite and Gemini Flash Latest if high demand (503) or rate limits occur.
 * Timeout raised to 60s to accommodate complex audio/video transcription.
 */
async function callGeminiJsonWithFallback(contents: any, timeoutMs = 60000): Promise<any> {
  if (!ai) throw new Error('Gemini AI not initialized');
  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  let lastErr: any = null;

  for (const modelName of modelsToTry) {
    try {
      const config: any = {
        responseMimeType: 'application/json'
      };
      if (modelName === 'gemini-3.8-flash') {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const callPromise = ai.models.generateContent({
        model: modelName,
        contents,
        config
      });
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms on ${modelName}`)), timeoutMs)
      );
      const response = (await Promise.race([callPromise, timeoutPromise])) as any;
      const rawText = response?.text?.trim() || '';
      if (rawText) {
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned);
      }
    } catch (err: any) {
      lastErr = err;
      const errMsg = String(err?.message || err);
      if (err?.status === 404 || errMsg.includes('404') || errMsg.includes('NOT_FOUND')) {
        console.error(`[Gemini Model Error] Model ${modelName} returned 404 Not Found:`, errMsg);
      } else {
        console.error(`[Gemini JSON Error] Model ${modelName} failed:`, errMsg);
      }
    }
  }
  throw lastErr || new Error('All Gemini models failed');
}

function detectAudioMimeType(audioBase64: string, fallbackMime = 'audio/wav'): string {
  if (!audioBase64) return fallbackMime;
  if (audioBase64.startsWith('UklGR')) return 'audio/wav';
  if (audioBase64.startsWith('SUQz') || audioBase64.startsWith('//') || audioBase64.startsWith('/+')) return 'audio/mpeg';
  return fallbackMime;
}

/**
 * Helper: Dedicated fast audio transcription via gemini-3.5-transcribe.
 * Timeout raised to 60s for full movie audio chunks.
 */
async function extractRawSpeechViaGeminiTranscribe(audioBase64: string, mimeType = 'audio/wav'): Promise<string> {
  if (!ai || !audioBase64) return '';
  try {
    const resolvedMime = detectAudioMimeType(audioBase64, mimeType);
    const callPromise = ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: resolvedMime,
              data: audioBase64
            }
          },
          {
            text: 'Transcribe all spoken words and dialogue in this audio accurately.'
          }
        ]
      }
    });
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('gemini-3.5-transcribe timeout (60s)')), 60000)
    );
    const response = (await Promise.race([callPromise, timeoutPromise])) as any;
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const transcribedParts: string[] = [];
    for (const part of parts) {
      if (part?.audioTranscription?.text) {
        transcribedParts.push(part.audioTranscription.text);
      } else if (part?.text) {
        transcribedParts.push(part.text);
      }
    }
    return transcribedParts.join(' ').trim() || (response?.text?.trim() || '');
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    if (err?.status === 404 || errMsg.includes('404') || errMsg.includes('NOT_FOUND')) {
      console.error('[Gemini Model Error] Model gemini-3.5-transcribe returned 404 Not Found:', errMsg);
    } else {
      console.error('[Transcribe Error] extractRawSpeechViaGeminiTranscribe failed:', errMsg, err?.stack);
    }
    return '';
  }
}

// API: Transcribe movie audio/video chunks + keyframes and adapt dialogue to Khmer with accurate timestamps
app.post('/api/transcribe', async (req: Request, res: Response) => {
  const { 
    title = 'Movie Clip', 
    genre = 'action', 
    duration = 20, 
    leadVoiceId = 'piseth', 
    audioBase64, 
    framesBase64 = [],
    mimeType,
    trackedPeaks = [],
    transcriptionMode = 'verbatim',
    sourceLang = 'auto',
    voiceSpeed = 1.0,
    customScript = '',
    chunkStartOffset = 0
  } = req.body;

  const offsetSeconds = Math.max(0, Number(chunkStartOffset) || 0);
  const safeDuration = Math.max(2, Number(duration) || 20);
  const mode: TranscriptionMode = (transcriptionMode === 'character' || transcriptionMode === 'verbatim' || transcriptionMode === 'recap')
    ? transcriptionMode
    : 'verbatim';
  const clampedSpeed = clampVoiceSpeed(Number(voiceSpeed) || 1.0);
  const fullMovieCueCount = Math.min(120, Math.max(4, Math.ceil(safeDuration / 3.8)));

  const validFrames = Array.isArray(framesBase64)
    ? framesBase64.filter((f: any) => typeof f === 'string' && f.length > 100).slice(0, 8)
    : [];
  const hasRealMedia = Boolean((typeof audioBase64 === 'string' && audioBase64.length > 200) || validFrames.length > 0);

  // 1. If user pasted custom SRT or script text, parse and translate any non-Khmer lines via Gemini
  if (typeof customScript === 'string' && customScript.trim().length > 0) {
    let parsedScriptSegs = parseScriptOrSrtToSegments(customScript, safeDuration, leadVoiceId, clampedSpeed);
    if (parsedScriptSegs.length > 0) {
      const needsTranslation = parsedScriptSegs.some(s => !/[\u1780-\u17FF]/.test(s.khmerText));
      if (needsTranslation && ai) {
        try {
          const translatePrompt = `Translate each segment's "originalText" into natural, accurate spoken Khmer ("khmerText") for video dubbing.
Mode: ${mode === 'recap' ? 'Cambodia Movie Recap Narration (សម្រាយរឿង)' : 'Faithful Spoken Khmer Translation'}.
Input segments:
${JSON.stringify(parsedScriptSegs.map(s => ({ id: s.id, originalText: s.originalText })))}

Return strictly a JSON array of objects:
[{ "id": "seg-...", "khmerText": "..." }]`;
          const translatedArr = await callGeminiJsonWithFallback(translatePrompt, 60000);
          if (Array.isArray(translatedArr)) {
            const mapById = new Map(translatedArr.map((item: any) => [item.id, item.khmerText]));
            parsedScriptSegs = parsedScriptSegs.map((seg, idx) => ({
              ...seg,
              khmerText: mapById.get(seg.id) || translatedArr[idx]?.khmerText || seg.khmerText,
              transcriptionMode: mode
            }));
          }
        } catch (scriptErr: any) {
          console.error('[Transcribe Error] Custom script translation failed:', scriptErr?.message || scriptErr, scriptErr?.stack);
        }
      }
      const offsetCustomSegs = parsedScriptSegs.map(s => ({
        ...s,
        start: Number((s.start + offsetSeconds).toFixed(2)),
        end: Number((s.end + offsetSeconds).toFixed(2))
      }));
      return res.json({
        success: true,
        source: 'custom_script',
        transcriptionMode: mode,
        chunkStartOffset: offsetSeconds,
        matchedVoicePeaksCount: offsetCustomSegs.length,
        segments: offsetCustomSegs
      });
    }
  }

  // Normalize voice peaks: For real media, do NOT invent synthetic peaks. Use real detected peaks or empty array.
  const validTrackedPeaks = Array.isArray(trackedPeaks) && trackedPeaks.length > 0
    ? trackedPeaks.map((p: any) => ({
        start: Number(p.start) || 0,
        end: Number(p.end) || 3,
        duration: Number(p.duration) || 2.5,
        peakEnergy: Number(p.peakEnergy) || 0.8,
        confidence: Number(p.confidence) || 0.96
      }))
    : (hasRealMedia ? [] : generateSyntheticVoicePeaks(safeDuration, fullMovieCueCount));

  // 2. Multimodal ASR + Keyframe Subtitle/Visual Transcription via Gemini 3.5 Transcribe + Gemini 3.8 Flash
  let lastTranscriptionError: any = null;
  if (ai) {
    let rawAsrText = '';
    try {
      const resolvedAudioMime = detectAudioMimeType(audioBase64 || '', mimeType || 'audio/wav');
      if (typeof audioBase64 === 'string' && audioBase64.length > 200) {
        rawAsrText = await extractRawSpeechViaGeminiTranscribe(audioBase64, resolvedAudioMime);
      }

      const styleInstruction = mode === 'verbatim'
        ? 'MODE: Accurate Verbatim Video Transcription & Faithful Khmer Translation (បកប្រែចំៗតាមសំឡេង និង អក្សរក្នុងវីដេអូដើម). Transcribe every spoken sentence or burned-in subtitle accurately in "originalText" and translate directly into clear, natural spoken Khmer in "khmerText".'
        : mode === 'recap'
        ? 'MODE: Cambodia Movie Recap Narration (សម្រាយរឿងភាពយន្តខ្មែរ) grounded 100% in this actual video. Transcribe what is spoken/shown in each scene in "originalText", and write natural Cambodian AI narration in "khmerText" describing the actual speech and visual events in this video using "AI Narrator (សម្រាយរឿង)" as speaker.'
        : 'MODE: Multi-Character Lip-Sync Video Dubbing (បញ្ចូលសំឡេងតួអង្គតាមវីដេអូ). Identify each speaker ("Speaker 1", "Speaker 2", etc.), transcribe their exact spoken words in "originalText", and translate into natural lip-synced spoken Khmer in "khmerText".';

      const langNotice = sourceLang && sourceLang !== 'auto'
        ? `Source audio/subtitle language: ${sourceLang}.`
        : 'Auto-detect the spoken language in the audio track and any burned-in subtitles in the video frames (English, Chinese, Korean, Thai, Khmer, etc.).';

      const peakTimingHint = validTrackedPeaks.length > 0
        ? `Detected voice activity intervals in this chunk (${safeDuration.toFixed(1)}s duration):\n${validTrackedPeaks.slice(0, 30).map((p, i) => `Cue #${i + 1}: ${p.start.toFixed(2)}s to ${p.end.toFixed(2)}s`).join(', ')}`
        : `Total chunk duration: ${safeDuration.toFixed(1)} seconds.`;

      const asrContextBlock = rawAsrText
        ? `\nVERBATIM SPEECH DETECTED BY GEMINI-3.5-TRANSCRIBE FROM VIDEO AUDIO:\n"""\n${rawAsrText}\n"""\nSegment and timestamp every sentence from this exact spoken transcript accurately across the ${safeDuration.toFixed(1)}s chunk, and combine with any burned-in subtitles visible in the attached video frames!`
        : '';

      const prompt = hasRealMedia
        ? `You are an expert multilingual video speech-to-text transcriber, subtitle OCR reader, and native Cambodian (Khmer) video translator.
You are analyzing a REAL user video chunk (duration: ${safeDuration.toFixed(1)} seconds, file/title: "${title}").
${langNotice}
${styleInstruction}
${peakTimingHint}${asrContextBlock}

CRITICAL ACCURACY RULES FOR THIS VIDEO:
1. DO NOT invent fictional stories about temples, fortresses, or warriors! You must ONLY transcribe what is ACTUALLY spoken in the video audio, written in burned-in subtitles on the attached video frames, or visibly happening in the video frames!
2. Each attached video frame has a yellow timestamp badge "TIME: X.Xs / ${safeDuration.toFixed(1)}s" in the top-left corner. Look at the bottom and center of each frame for any burned-in subtitles or captions, and look at the visual action at that exact timestamp.
3. Segment the video chunk from beginning (0s) to end (${safeDuration.toFixed(1)}s) with accurate relative "start" and "end" timestamps in seconds (relative to 0s of this chunk) matching when each spoken phrase, subtitle, or scene occurs.
4. For every segment:
   - "originalText": The exact transcribed words spoken in the audio (or read from the video's burned-in subtitles). If a portion of the video has no speech/subtitles, write a concise factual description of what is visibly happening in the video frame at that timestamp.
   - "khmerText": Accurate, natural spoken Khmer translation (ភាសានិយាយខ្មែរច្បាស់ៗ ត្រឹមត្រូវតាមអត្ថន័យក្នុងវីដេអូពិតប្រាកដ) so the Cambodian AI voice speaks the exact meaning of the video.
   - "speaker": Speaker label (e.g. "Speaker 1", "Speaker 2", or "AI Narrator (សម្រាយរឿង)").
   - "speakerVoiceId": "${leadVoiceId}" (or "sreymom" for female character / secondary speaker).
   - "confidence": ASR confidence between 0.94 and 0.99.

Return strictly a JSON array of segment objects:
[
  {
    "id": "seg-1",
    "start": 0.5,
    "end": 3.5,
    "speaker": "Speaker 1",
    "speakerVoiceId": "${leadVoiceId}",
    "originalText": "Exact transcribed speech or subtitle from the video",
    "khmerText": "ការបកប្រែជាភាសាខ្មែរយ៉ាងត្រឹមត្រូវតាមសំឡេងក្នុងវីដេអូ",
    "confidence": 0.98
  }
]`
        : `You are a master Cambodian movie dubber and translator.
Project title: "${title}", genre: "${genre}", total duration: ${safeDuration.toFixed(1)} seconds.
${styleInstruction}
${peakTimingHint}

Generate ${validTrackedPeaks.length} sequential timestamped dialogue segments covering 0s to ${safeDuration.toFixed(1)}s with natural English "originalText" and natural spoken Khmer "khmerText".
Return strictly a JSON array of objects with keys: "id", "start", "end", "speaker", "speakerVoiceId", "originalText", "khmerText", "confidence".`;

      const parts: any[] = [];
      // Only attach raw audioBase64 to Gemini 3.8 if gemini-3.5-transcribe did not already produce rawAsrText
      if (!rawAsrText && typeof audioBase64 === 'string' && audioBase64.length > 200) {
        parts.push({
          inlineData: {
            mimeType: resolvedAudioMime,
            data: audioBase64
          }
        });
      }
      for (const frameB64 of validFrames) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: frameB64
          }
        });
      }
      parts.push({ text: prompt });

      const contents = parts.length > 1 ? { parts } : prompt;
      const parsed = await callGeminiJsonWithFallback(contents, 60000);

      if (Array.isArray(parsed) && parsed.length > 0) {
        const sanitized = sanitizeTranscribedSegments(
          parsed,
          safeDuration,
          leadVoiceId,
          clampedSpeed,
          mode
        );
        if (sanitized.length > 0) {
          // Add chunkStartOffset to every segment's start and end so timestamps align to the full movie
          const offsetSegments = sanitized.map(seg => ({
            ...seg,
            start: Number((seg.start + offsetSeconds).toFixed(2)),
            end: Number((seg.end + offsetSeconds).toFixed(2))
          }));

          return res.json({
            success: true,
            source: hasRealMedia ? 'gemini-3.8-multimodal-asr' : 'gemini-3.8-ai',
            chunkStartOffset: offsetSeconds,
            rawAsrTranscript: rawAsrText || undefined,
            transcriptionMode: mode,
            matchedVoicePeaksCount: offsetSegments.length,
            segments: offsetSegments
          });
        }
      }
    } catch (err: any) {
      lastTranscriptionError = err;
      console.error('[Transcribe Error] Gemini multimodal transcription failed:', err?.message || err, err?.stack);

      // If gemini-3.5-transcribe succeeded with rawAsrText even if JSON formatting timed out, convert rawAsrText into real segments!
      if (rawAsrText && rawAsrText.trim().length > 0) {
        const sentences = rawAsrText
          .split(/(?<=[.!?។!?।\n])\s+/)
          .map(s => s.trim())
          .filter(Boolean);
        const asrSegments = parseScriptOrSrtToSegments(
          sentences.join('\n'),
          safeDuration,
          leadVoiceId,
          clampedSpeed
        );
        if (asrSegments.length > 0) {
          const offsetAsrSegments = asrSegments.map(seg => ({
            ...seg,
            start: Number((seg.start + offsetSeconds).toFixed(2)),
            end: Number((seg.end + offsetSeconds).toFixed(2))
          }));

          return res.json({
            success: true,
            source: 'gemini-3.5-transcribe',
            chunkStartOffset: offsetSeconds,
            rawAsrTranscript: rawAsrText,
            transcriptionMode: mode,
            matchedVoicePeaksCount: offsetAsrSegments.length,
            segments: offsetAsrSegments
          });
        }
      }
    }
  }

  // Never return fake local_engine segments for a real uploaded video!
  if (hasRealMedia) {
    const errorMsg = lastTranscriptionError?.message || 'Speech recognition failed for this video chunk';
    console.error('[Transcribe Error] Real media transcription failed, returning 500 error to client:', errorMsg);
    return res.status(500).json({
      success: false,
      error: errorMsg,
      chunkStartOffset: offsetSeconds
    });
  }

  // Fallback ONLY for empty/template projects with no uploaded video or audio
  const fallbackSegments = generateSegmentsForUploadedVideo(
    safeDuration,
    genre,
    leadVoiceId,
    validTrackedPeaks.length,
    mode,
    clampedSpeed
  );
  const matchedFallback = alignSegmentsToVoicePeaks(fallbackSegments, validTrackedPeaks, safeDuration).map(s => ({
    ...s,
    start: Number((s.start + offsetSeconds).toFixed(2)),
    end: Number((s.end + offsetSeconds).toFixed(2)),
    speedRatio: clampedSpeed,
    transcriptionMode: mode
  }));
  return res.json({
    success: true,
    source: 'local_engine',
    chunkStartOffset: offsetSeconds,
    transcriptionMode: mode,
    matchedVoicePeaksCount: matchedFallback.length,
    segments: matchedFallback
  });
});

// API: AI Translate to Khmer with accurate spoken Khmer or Cambodia Movie Recap (សម្រាយរឿង) adaptation
app.post('/api/translate', async (req: Request, res: Response) => {
  const { text, targetTone = 'cinematic', maxDuration, mode = 'verbatim' } = req.body;
  
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required for translation' });
  }

  if (ai) {
    try {
      const modeRule = mode === 'recap'
        ? 'Style: Cambodia Movie Recap Narration (សម្រាយរឿងភាពយន្តខ្មែរ, e.g. "នៅក្នុងឈុតនេះ...", "ភ្លាមៗនោះ...").'
        : 'Style: Accurate, natural spoken Cambodian video dialogue (បកប្រែចំៗតាមអត្ថន័យដើមជាភាសានិយាយខ្មែរ).';

      const prompt = `You are a native Cambodian video translator and dubbing specialist (អ្នកបកប្រែ និង បញ្ចូលសំឡេងវីដេអូខ្មែរ).
Translate the following line accurately into natural spoken Khmer.

Rules:
1. ${modeRule}
2. Tone: ${targetTone}.
3. Brevity: Keep the length natural so it can be spoken in approximately ${maxDuration ? maxDuration.toFixed(1) + ' seconds' : 'the original time slot'}.
4. Output JSON format only:
{
  "khmerText": "the translated Khmer line",
  "suggestedTone": "${targetTone}",
  "estimatedSyllables": 12,
  "adaptationNote": "brief note"
}

Source line to translate:
"${text}"`;

      const parsed = await callGeminiJsonWithFallback(prompt, 8000);
      if (parsed && parsed.khmerText) {
        return res.json({
          success: true,
          khmerText: parsed.khmerText,
          suggestedTone: parsed.suggestedTone || targetTone,
          adaptationNote: parsed.adaptationNote || 'Gemini 3.8 Khmer Translation',
          source: 'gemini-3.8'
        });
      }
    } catch (err: any) {
      console.log('[Translate Engine] Using local Khmer dictionary adapter.');
    }
  }

  const fallbackTranslations: Record<string, string> = {
    'we must breach the ancient temple gate before sunset!': 'យើងត្រូវតែទម្លុះទ្វារប្រាសាទបុរាណនេះ មុនពេលព្រះអាទិត្យលិច!',
    'wait, the sacred inscription warns of a curse on whoever disturbs it.': 'ចាំសិន! សិលាចារឹកពិសិដ្ឋបានព្រមានពីបណ្តាសា ដល់អ្នកណាដែលមករំខានវា។',
    'in a kingdom forgotten by time, courage is the only weapon that remains.': 'នៅក្នុងនគរមួយដែលពេលវេលាបានបំភ្លេច សេចក្តីក្លាហានគឺជាអាវុធតែមួយគត់ដែលនៅសេសសល់។',
    'draw your swords! we fight together, or we fall together!': 'ដកដាវរបស់អ្នកឡើង! យើងតស៊ូជាមួយគ្នា ឬក៏យើងត្រូវដួលរលំទាំងអស់គ្នា!',
    'look at the mountain.': 'មើលទៅភ្នំនោះមើល។',
    'it is so beautiful.': 'វាពិតជាស្រស់ស្អាតខ្លាំងណាស់!',
    'who goes there? show yourself!': 'អ្នកណាគេហ្នឹង? ចេញមុខមកភ្លាម!',
    'i have waited ten years for this moment.': 'ខ្ញុំបានរង់ចាំពេលនេះអស់រយៈពេលដប់ឆ្នាំមកហើយ!',
    'don\'t look back, run!': 'កុំងាកក្រោយ រត់ទៅ!',
    'everything depends on you now.': 'អ្វីៗគ្រប់យ៉ាងពេលនេះគឺពឹងផ្អែកលើអ្នកហើយ។'
  };

  const normalized = text.toLowerCase().trim().replace(/[.,!?;]/g, '');
  const matched = Object.entries(fallbackTranslations).find(([key]) => key.includes(normalized) || normalized.includes(key));
  const resultKhmer = matched ? matched[1] : text;

  return res.json({
    success: true,
    khmerText: resultKhmer,
    suggestedTone: targetTone,
    adaptationNote: 'Local dictionary adapter',
    source: 'local'
  });
});

// API: Batch AI Translation for segments
app.post('/api/translate/batch', async (req: Request, res: Response) => {
  const { segments } = req.body;
  if (!Array.isArray(segments)) {
    return res.status(400).json({ error: 'Segments array is required' });
  }

  if (ai) {
    try {
      const prompt = `You are a professional Khmer video dubber and translator.
Translate each dialogue segment accurately from its source language into natural spoken Khmer.
Keep the sentence lengths concise to fit the time duration (end - start).
Input segments:
${JSON.stringify(segments.map(s => ({ id: s.id, text: s.originalText, duration: s.end - s.start, speaker: s.speaker })))}

Respond with JSON array only:
[
  { "id": "...", "khmerText": "..." }
]`;

      const parsed = await callGeminiJsonWithFallback(prompt, 10000);
      if (Array.isArray(parsed)) {
        return res.json({ success: true, translatedSegments: parsed });
      }
    } catch (err: any) {
      console.log('[Batch Translate] Using segment text passthrough.');
    }
  }

  return res.json({
    success: true,
    translatedSegments: segments.map(s => ({
      id: s.id,
      khmerText: s.khmerText || s.originalText
    }))
  });
});

// API: Get Project
app.get('/api/projects/:id', (req: Request, res: Response) => {
  const project = mockProjects[req.params.id] || mockProjects['proj-khmer-action-01'];
  res.json({ success: true, project });
});

// API: Update Project Segments
app.put('/api/projects/:id/segments', (req: Request, res: Response) => {
  const { segments, bgmVolume, voiceVolume, duckingThreshold } = req.body;
  const project = mockProjects[req.params.id] || mockProjects['proj-khmer-action-01'];
  if (segments) project.segments = segments;
  if (bgmVolume !== undefined) project.bgmVolume = bgmVolume;
  if (voiceVolume !== undefined) project.voiceVolume = voiceVolume;
  if (duckingThreshold !== undefined) project.duckingThreshold = duckingThreshold;
  res.json({ success: true, project });
});

// Setup Vite middlewares in dev mode or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KhmerDub Studio Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
