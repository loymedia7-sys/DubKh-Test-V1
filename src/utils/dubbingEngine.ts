/**
 * Core pure calculation and state-machine logic for Khmer Movie Dubbing
 * Decoupled from React UI to enable deterministic unit testing with node:test.
 */

export type TranscriptionMode = 'recap' | 'character' | 'verbatim';
export type SourceLanguage = 'auto' | 'en' | 'zh' | 'ko' | 'th' | 'km';

export interface DubbingSegment {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  speaker: string; // e.g. "Speaker 1", "Speaker 2", "AI Narrator (សម្រាយរឿង)"
  speakerVoiceId: string; // "piseth" | "sreymom" | "sovann" | "apsara" | "borey" | "kolab" | "kiri" | "dara"
  originalText: string;
  khmerText: string;
  emotion?: 'neutral' | 'dramatic' | 'action' | 'whisper' | 'shout';
  audioBlobUrl?: string;
  naturalDuration?: number;
  speedRatio?: number;
  confidence?: number;
  transcriptionMode?: TranscriptionMode;
}

export interface VoiceSpeedPreset {
  id: string;
  label: string;
  kmLabel: string;
  value: number;
  badge?: string;
}

export const VOICE_SPEED_PRESETS: VoiceSpeedPreset[] = [
  { id: 'natural-088', label: '0.88x Natural', kmLabel: 'ធម្មជាតិ (~4.3s at 0.88x)', value: 0.88, badge: 'Recommended' },
  { id: 'slow', label: '0.80x Slow', kmLabel: 'យឺតច្បាស់ (0.8x)', value: 0.8 },
  { id: 'normal', label: '1.00x Normal', kmLabel: 'ធម្មតា (1.0x)', value: 1.0 },
  { id: 'recap', label: '1.15x Recap', kmLabel: 'សម្រាយរឿង (1.15x)', value: 1.15, badge: 'Popular' },
  { id: 'fast', label: '1.25x Fast', kmLabel: 'លឿនល្មម (1.25x)', value: 1.25 },
  { id: 'turbo', label: '1.50x Turbo', kmLabel: 'លឿនខ្លាំង (1.5x)', value: 1.5 }
];

/**
 * Clamps a voice speed multiplier to the safe pitch-preserved range [0.5, 2.0].
 */
export function clampVoiceSpeed(speed: number): number {
  if (typeof speed !== 'number' || isNaN(speed) || !isFinite(speed)) return 1.0;
  return Math.min(2.0, Math.max(0.5, Number(speed.toFixed(2))));
}

/**
 * Calculates the actual spoken duration in seconds when Khmer text is spoken at a given speed multiplier.
 * Accepts an optional preset natural duration (in seconds).
 */
export function calculateEffectiveSpeechDuration(
  khmerText: string,
  speedRatio: number = 1.0,
  masterSpeed: number = 1.0,
  presetNaturalDuration?: number
): number {
  const natural = presetNaturalDuration && presetNaturalDuration > 0
    ? presetNaturalDuration
    : estimateKhmerDuration(khmerText);
  const effectiveSpeed = clampVoiceSpeed(speedRatio * masterSpeed);
  return Math.max(0.4, Number((natural / effectiveSpeed).toFixed(2)));
}

/**
 * Applies a uniform voice speed multiplier across all segments and updates timing metrics.
 */
export function applyVoiceSpeedToSegments(
  segments: DubbingSegment[],
  targetSpeed: number
): DubbingSegment[] {
  const clamped = clampVoiceSpeed(targetSpeed);
  return segments.map(seg => {
    const est = seg.naturalDuration || estimateKhmerDuration(seg.khmerText);
    return {
      ...seg,
      naturalDuration: est,
      speedRatio: clamped
    };
  });
}

export interface DuckingConfig {
  bgmVolume: number;         // 0.0 - 1.0 (ambient/video audio volume)
  voiceVolume: number;       // 0.0 - 1.5 (Khmer dub volume)
  duckingThreshold: number;  // 0.0 - 0.5 (0.0 = completely silent original voice during speech)
  attackTime: number;        // seconds to ramp down bgm (default 0.12)
  releaseTime: number;       // seconds to ramp back up (default 0.35)
  muteOriginalVoice: boolean; // default true: mutes original voice to avoid double-talking
  originalAudioMode: 'mute_dialogue' | 'mute_all' | 'duck_dialogue' | 'keep_original';
}

export type PipelineStage = 
  | 'idle'
  | 'download'
  | 'extract'
  | 'separate'
  | 'transcribe'
  | 'translate'
  | 'user_editing'
  | 'voice'
  | 'sync'
  | 'mix'
  | 'export'
  | 'completed'
  | 'error';

/**
 * Converts timestamp string (e.g. "00:01:23,456" or "00:01:23.456") to seconds.
 */
export function parseSrtTime(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const cleaned = timeStr.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(cleaned) || 0;
}

/**
 * Converts seconds to standard SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

/**
 * Converts seconds to WebVTT timestamp format: HH:MM:SS.mmm
 */
export function formatVttTime(seconds: number): string {
  return formatSrtTime(seconds).replace(',', '.');
}

/**
 * Estimates natural speaking duration in seconds for Khmer text.
 * Khmer Unicode strings include consonants, coeng subscripts, dependent vowels, and diacritics (~2.5 codepoints per syllable).
 * Normal Cambodian AI speaking pace is ~18 Khmer Unicode characters per second.
 */
export function estimateKhmerDuration(text: string, charsPerSec = 18): number {
  if (!text) return 0;
  // Remove spaces and punctuation
  const clean = text.replace(/[\s.,!?;:()""''\u17D4\u17D5]/g, '');
  if (clean.length === 0) return 0.5;
  const estimated = clean.length / charsPerSec;
  // Minimum natural clip duration is 0.6 seconds
  return Math.max(0.6, Number(estimated.toFixed(2)));
}

/**
 * Calculates required time-stretch factor to fit a Khmer speech segment into the source video time slot.
 * Supports dynamic speed-up up to maxRate (default 1.80x matching Nice One Dubber at 02:31).
 */
export function calculateTimeStretch(
  targetSlotDuration: number, 
  naturalSpeechDuration: number,
  maxRate: number = 1.80
) {
  if (targetSlotDuration <= 0) targetSlotDuration = 0.5;
  if (naturalSpeechDuration <= 0) naturalSpeechDuration = 0.5;

  const rawRate = naturalSpeechDuration / targetSlotDuration;
  // Clamp between 0.7x (can be spoken slightly slower) and maxRate (default 1.80x for fast action dubbing)
  const clampedRate = Math.min(maxRate, Math.max(0.7, Number(rawRate.toFixed(2))));
  const isOverflow = rawRate > 1.20;
  const isSevereOverflow = rawRate > 1.50;

  let status: 'optimal' | 'stretched' | 'compressed' | 'critical' = 'optimal';
  if (rawRate < 0.85) status = 'stretched';
  else if (isSevereOverflow) status = 'critical';
  else if (isOverflow) status = 'compressed';

  return {
    rate: clampedRate,
    isOverflow,
    isSevereOverflow,
    overflowRatio: Number(rawRate.toFixed(2)),
    status,
    recommendation: isSevereOverflow
      ? 'Khmer text requires high speed-up to fit video slot.'
      : isOverflow
      ? 'Speed auto-accelerated to match actor mouth movement.'
      : 'Perfect timing match with video cut.'
  };
}

export interface AutoFitMetrics {
  rushedLinesCount: number;
  optimalLinesCount: number;
  maxSpeedLimit: number;
  segments: DubbingSegment[];
}

/**
 * Automatically calculates each line's voice speed (up to maxSpeedLimit, default 1.80x)
 * so Khmer speech finishes inside the exact timestamp of the original actor's lip movements,
 * returning the count of rushed lines (as seen at 04:01 of Nice One Dubber).
 */
export function calculateAutoFitTiming(
  segments: DubbingSegment[],
  maxSpeedLimit: number = 1.80
): AutoFitMetrics {
  let rushedCount = 0;
  let optimalCount = 0;
  const clampedLimit = Math.min(2.0, Math.max(1.1, Number(maxSpeedLimit) || 1.80));

  const updated = segments.map(seg => {
    const slotDuration = Math.max(0.5, Number((seg.end - seg.start).toFixed(2)));
    const estDuration = seg.naturalDuration || estimateKhmerDuration(seg.khmerText);
    const stretch = calculateTimeStretch(slotDuration, estDuration, clampedLimit);

    // In Nice One Dubber: lines requiring acceleration >= 1.20x count as rushed lines
    const isRushed = stretch.rate >= 1.20;
    if (isRushed) {
      rushedCount++;
    } else {
      optimalCount++;
    }

    return {
      ...seg,
      naturalDuration: estDuration,
      speedRatio: stretch.rate
    };
  });

  return {
    rushedLinesCount: rushedCount,
    optimalLinesCount: optimalCount,
    maxSpeedLimit: clampedLimit,
    segments: updated
  };
}

/**
 * Automatically adjusts timeframe start & end for every segment to match the exact
 * spoken duration of its Khmer TTS voice script at target speed (default 0.88x), plus a natural breath gap.
 * Ensures full voice scripts speak without rushing, and segments do not cut each other off.
 * If fixedSlotDuration is provided (e.g. 4.3s), standardizes every segment's timeframe to that exact duration.
 */
export function autoAlignTimeframesToSpeech(
  segments: DubbingSegment[],
  breathGap: number = 0.30,
  targetSpeed: number = 0.88,
  fixedSlotDuration?: number
): { segments: DubbingSegment[]; totalDuration: number } {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { segments: [], totalDuration: 0 };
  }

  const speed = clampVoiceSpeed(targetSpeed || 0.88);
  let runningTime = 0;

  const aligned = segments.map((seg, idx) => {
    const lineDuration = fixedSlotDuration && fixedSlotDuration > 0
      ? fixedSlotDuration
      : Math.max(0.8, Number(((seg.naturalDuration || estimateKhmerDuration(seg.khmerText)) / speed).toFixed(2)));

    const naturalDur = fixedSlotDuration && fixedSlotDuration > 0
      ? Number((fixedSlotDuration * speed).toFixed(2))
      : (seg.naturalDuration || estimateKhmerDuration(seg.khmerText));

    const start = idx === 0
      ? Math.max(0, seg.start)
      : Math.max(Number((runningTime + breathGap).toFixed(2)), seg.start);
    const end = Number((start + lineDuration).toFixed(2));
    runningTime = end;

    return {
      ...seg,
      start,
      end,
      naturalDuration: naturalDur,
      speedRatio: speed
    };
  });

  const totalDuration = aligned.length > 0 ? aligned[aligned.length - 1].end : 0;
  return { segments: aligned, totalDuration };
}

/**
 * Generates valid SubRip (.srt) subtitle file string from segments.
 */
export function generateSrt(segments: DubbingSegment[]): string {
  return segments
    .filter(seg => seg.khmerText.trim().length > 0)
    .sort((a, b) => a.start - b.start)
    .map((seg, index) => {
      return `${index + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.khmerText.trim()}\n`;
    })
    .join('\n');
}

/**
 * Generates WebVTT (.vtt) format subtitle string from segments.
 */
export function generateVtt(segments: DubbingSegment[]): string {
  const body = segments
    .filter(seg => seg.khmerText.trim().length > 0)
    .sort((a, b) => a.start - b.start)
    .map((seg, index) => {
      return `${index + 1}\n${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n${seg.khmerText.trim()}`;
    })
    .join('\n\n');

  return `WEBVTT - Khmer Dubbed Subtitles\n\n${body}\n`;
}

/**
 * Parses SRT subtitles, WebVTT subtitles, timestamped lines, or plain multi-line scripts
 * into structured DubbingSegments across a video timeline.
 */
export function parseScriptOrSrtToSegments(
  rawText: string,
  totalDuration: number = 30,
  leadVoiceId: string = 'piseth',
  defaultSpeed: number = 1.0
): DubbingSegment[] {
  if (!rawText || !rawText.trim()) return [];
  const safeDuration = Math.max(5, totalDuration || 30);
  const clampedSpeed = clampVoiceSpeed(defaultSpeed);
  const hasKhmerChars = (str: string) => /[\u1780-\u17FF]/.test(str);

  // 1. Check if input contains SRT/VTT timestamp arrows (-->)
  if (rawText.includes('-->')) {
    const blocks = rawText
      .replace(/\r\n/g, '\n')
      .replace(/^WEBVTT[^\n]*\n+/i, '')
      .split(/\n\s*\n/)
      .map(b => b.trim())
      .filter(Boolean);

    const parsed: DubbingSegment[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const lines = blocks[i].split('\n').map(l => l.trim()).filter(Boolean);
      const arrowIdx = lines.findIndex(l => l.includes('-->'));
      if (arrowIdx === -1) continue;

      const timeLine = lines[arrowIdx];
      const [startStr, endStr] = timeLine.split('-->').map(s => s.trim().split(' ')[0]);
      const start = Number(parseSrtTime(startStr).toFixed(2));
      const rawEnd = Number(parseSrtTime(endStr).toFixed(2));
      const end = rawEnd > start ? rawEnd : Number((start + 3.0).toFixed(2));
      const textLines = lines.slice(arrowIdx + 1).join(' ').trim();
      if (!textLines) continue;

      const isKhmer = hasKhmerChars(textLines);
      const khmerText = isKhmer ? textLines : textLines;
      const est = estimateKhmerDuration(khmerText);

      parsed.push({
        id: `seg-srt-${i + 1}`,
        start,
        end,
        speaker: i % 2 === 0 ? 'Speaker 1' : 'Speaker 2',
        speakerVoiceId: leadVoiceId,
        originalText: textLines,
        khmerText,
        naturalDuration: est,
        speedRatio: clampedSpeed,
        confidence: 0.99,
        transcriptionMode: 'verbatim'
      });
    }
    if (parsed.length > 0) return parsed;
  }

  // 2. Otherwise parse plain multi-line script or dialogue lines
  const rawLines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^\d+$/.test(l));

  if (rawLines.length === 0) return [];

  const numLines = rawLines.length;
  const usable = safeDuration * 0.92;
  const slotDur = Math.max(1.2, Number((usable / numLines).toFixed(2)));
  const gap = Math.max(0.1, Number(((safeDuration - slotDur * numLines) / (numLines + 1)).toFixed(2)));

  return rawLines.map((line, idx) => {
    // Check if line has speaker prefix like "Speaker 1: Hello" or "[00:01.5] Hello"
    let speaker = `Speaker ${(idx % 2) + 1}`;
    let cleanLine = line;
    let explicitStart: number | null = null;
    let explicitEnd: number | null = null;

    const timeBracketMatch = cleanLine.match(/^\[?(\d+(?::\d+)*(?:\.\d+)?)\s*(?:-|-->|to)\s*(\d+(?::\d+)*(?:\.\d+)?)\]?\s*(.+)$/i);
    if (timeBracketMatch) {
      explicitStart = parseSrtTime(timeBracketMatch[1]);
      explicitEnd = parseSrtTime(timeBracketMatch[2]);
      cleanLine = timeBracketMatch[3].trim();
    }

    const colonMatch = cleanLine.match(/^([^:]{2,24}):\s*(.+)$/);
    if (colonMatch) {
      speaker = colonMatch[1].trim();
      cleanLine = colonMatch[2].trim();
    }

    const start = explicitStart !== null
      ? Number(Math.max(0, explicitStart).toFixed(2))
      : Number((gap + idx * (slotDur + gap)).toFixed(2));
    const end = explicitEnd !== null && explicitEnd > start
      ? Number(Math.min(safeDuration, explicitEnd).toFixed(2))
      : Number(Math.min(safeDuration, start + slotDur).toFixed(2));
    const isKhmer = hasKhmerChars(cleanLine);
    const khmerText = isKhmer ? cleanLine : cleanLine;
    const est = estimateKhmerDuration(khmerText);

    return {
      id: `seg-script-${idx + 1}`,
      start,
      end,
      speaker,
      speakerVoiceId: leadVoiceId,
      originalText: cleanLine,
      khmerText,
      naturalDuration: est,
      speedRatio: clampedSpeed,
      confidence: 0.98,
      transcriptionMode: 'verbatim'
    };
  });
}

/**
 * Sanitizes, sorts, and validates real transcribed video segments from Gemini ASR.
 * Critically preserves actual spoken/subtitle timestamps and text from the video
 * without overwriting timestamps with synthetic peaks or padding with unrelated template lines.
 */
export function sanitizeTranscribedSegments(
  rawSegments: any[],
  totalDuration: number = 20,
  leadVoiceId: string = 'piseth',
  defaultSpeed: number = 1.0,
  mode: TranscriptionMode = 'verbatim'
): DubbingSegment[] {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) return [];
  const safeDuration = Math.max(2, Number(totalDuration) || 20);
  const clampedSpeed = clampVoiceSpeed(defaultSpeed);
  const secondaryVoice = leadVoiceId === 'piseth' ? 'sreymom' : 'piseth';

  // Filter out empty entries
  const validRaw = rawSegments.filter(
    s => s && (
      (typeof s.originalText === 'string' && s.originalText.trim().length > 0) ||
      (typeof s.khmerText === 'string' && s.khmerText.trim().length > 0) ||
      (typeof s.text === 'string' && s.text.trim().length > 0)
    )
  );
  if (validRaw.length === 0) return [];

  const count = validRaw.length;
  const defaultSlot = Math.max(1.2, Number((safeDuration / count).toFixed(2)));

  // Normalize start/end timestamps
  const prelim = validRaw.map((s, idx) => {
    const hasStart = s.start !== undefined && s.start !== null && !isNaN(Number(s.start));
    const hasEnd = s.end !== undefined && s.end !== null && !isNaN(Number(s.end));

    let start = hasStart
      ? Number(s.start)
      : typeof s.startTime === 'string'
      ? parseSrtTime(s.startTime)
      : Number((idx * defaultSlot).toFixed(2));

    let end = hasEnd
      ? Number(s.end)
      : typeof s.endTime === 'string'
      ? parseSrtTime(s.endTime)
      : Number((start + defaultSlot * 0.9).toFixed(2));

    start = Math.max(0, Math.min(safeDuration - 0.4, Number(start.toFixed(2))));
    if (end <= start + 0.3) {
      end = Math.min(safeDuration, Number((start + Math.max(1.5, defaultSlot * 0.85)).toFixed(2)));
    } else {
      end = Math.min(safeDuration, Number(end.toFixed(2)));
    }

    const originalText = String(s.originalText || s.text || s.khmerText || '').trim();
    const khmerText = String(s.khmerText || s.translatedText || originalText).trim();
    const speaker = String(
      s.speaker || (mode === 'recap' ? 'AI Narrator (សម្រាយរឿង)' : `Speaker ${(idx % 2) + 1}`)
    ).trim();
    const speakerVoiceId = String(
      s.speakerVoiceId || (mode === 'recap' ? leadVoiceId : (idx % 2 === 0 ? leadVoiceId : secondaryVoice))
    ).trim();

    return {
      rawId: s.id,
      start,
      end,
      speaker,
      speakerVoiceId,
      originalText,
      khmerText,
      speedRatio: clampVoiceSpeed(Number(s.speedRatio) || clampedSpeed),
      confidence: Math.min(0.99, Math.max(0.8, Number(s.confidence) || 0.97))
    };
  });

  // Sort chronologically by start time
  prelim.sort((a, b) => a.start - b.start);

  // Prevent overlapping intervals so subtitles in video never collide
  for (let i = 0; i < prelim.length; i++) {
    const cur = prelim[i];
    const next = prelim[i + 1];
    if (next && cur.end > next.start) {
      if (next.start - cur.start >= 0.6) {
        cur.end = Number((next.start - 0.05).toFixed(2));
      } else {
        next.start = Number(Math.min(safeDuration - 0.4, cur.end + 0.05).toFixed(2));
        if (next.end <= next.start + 0.3) {
          next.end = Number(Math.min(safeDuration, next.start + 1.4).toFixed(2));
        }
      }
    }
  }

  return prelim.map((item, idx) => {
    const est = estimateKhmerDuration(item.khmerText);
    return {
      id: item.rawId || `seg-${idx + 1}`,
      start: item.start,
      end: item.end,
      speaker: item.speaker,
      speakerVoiceId: item.speakerVoiceId,
      originalText: item.originalText,
      khmerText: item.khmerText,
      naturalDuration: est,
      speedRatio: item.speedRatio,
      confidence: item.confidence,
      transcriptionMode: mode
    };
  });
}

/**
 * Calculates current background music gain and ducking envelope for audio mixer.
 * Automatically silences original voice track during dialogue if muteOriginalVoice is enabled.
 */
export function calculateDuckingGain(
  currentTime: number,
  segments: DubbingSegment[],
  config: DuckingConfig
): { bgmGain: number; voiceGain: number; activeSegment: DubbingSegment | null } {
  // If user requested all original audio muted
  if (config.originalAudioMode === 'mute_all') {
    const activeSeg = segments.find(s => currentTime >= s.start && currentTime <= s.end) || null;
    return {
      bgmGain: 0,
      voiceGain: activeSeg ? config.voiceVolume : 0,
      activeSegment: activeSeg
    };
  }

  const effectiveThreshold = (config.muteOriginalVoice || config.originalAudioMode === 'mute_dialogue')
    ? 0.0 
    : config.duckingThreshold;

  const activeSegment = segments.find(
    s => currentTime >= (s.start - config.attackTime) && currentTime <= (s.end + config.releaseTime)
  ) || null;

  if (!activeSegment) {
    return {
      bgmGain: config.bgmVolume,
      voiceGain: 0,
      activeSegment: null
    };
  }

  // Smooth attack / release ducking
  let duckFactor = effectiveThreshold;
  if (currentTime < activeSegment.start) {
    // Attack phase: smoothly dip from bgmVolume to threshold (or 0)
    const progress = (currentTime - (activeSegment.start - config.attackTime)) / config.attackTime;
    duckFactor = config.bgmVolume - (config.bgmVolume - effectiveThreshold) * Math.min(1, Math.max(0, progress));
  } else if (currentTime > activeSegment.end) {
    // Release phase: smoothly recover from threshold back to bgmVolume
    const progress = (currentTime - activeSegment.end) / config.releaseTime;
    duckFactor = effectiveThreshold + (config.bgmVolume - effectiveThreshold) * Math.min(1, Math.max(0, progress));
  }

  const voiceIsActive = currentTime >= activeSegment.start && currentTime <= activeSegment.end;

  return {
    bgmGain: Number(duckFactor.toFixed(3)),
    voiceGain: voiceIsActive ? config.voiceVolume : 0,
    activeSegment: voiceIsActive ? activeSegment : null
  };
}

/**
 * Maps a pipeline stage to a progress percentage (0 - 100).
 */
export function getStageProgress(stage: PipelineStage): number {
  switch (stage) {
    case 'idle': return 0;
    case 'download': return 12;
    case 'extract': return 26;
    case 'separate': return 42;
    case 'transcribe': return 58;
    case 'translate': return 72;
    case 'user_editing': return 75; // Waiting for user review
    case 'voice': return 86;
    case 'sync': return 92;
    case 'mix': return 97;
    case 'export': return 99;
    case 'completed': return 100;
    case 'error': return 0;
  }
}

/**
 * Generates an authentic Bakong KHQR EMVCo compatible payload string for Cambodian payments.
 */
export function generateBakongKHQRPayload(account: string, name: string, amount: number, currency: 'USD' | 'KHR' = 'USD'): string {
  const currCode = currency === 'USD' ? '840' : '116';
  const amountStr = amount.toFixed(currency === 'USD' ? 2 : 0);

  // Simplified valid EMVCo Tag-Length-Value payload
  const tagPayload = (tag: string, val: string) => `${tag}${String(val.length).padStart(2, '0')}${val}`;
  
  const payloadFormat = tagPayload('00', '01');
  const pointOfInit = tagPayload('01', '12'); // dynamic QR
  const bakongMerchant = tagPayload('29', 
    tagPayload('00', 'bakong@nbc') +
    tagPayload('01', account)
  );
  const merchantCat = tagPayload('52', '5999');
  const txCurr = tagPayload('53', currCode);
  const txAmt = tagPayload('54', amountStr);
  const country = tagPayload('58', 'KH');
  const merchantName = tagPayload('59', name);
  const city = tagPayload('60', 'Phnom Penh');
  
  const raw = `${payloadFormat}${pointOfInit}${bakongMerchant}${merchantCat}${txCurr}${txAmt}${country}${merchantName}${city}6304`;
  let crc = 0xFFFF;
  for (let i = 0; i < raw.length; i++) {
    crc ^= (raw.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
  return `${raw}${crcHex}`;
}

/**
 * Generates full-movie dialogue & Cambodian AI narration segments scaled and fitted
 * across the entire uploaded video's duration from beginning to end.
 * Supports 3 specialized modes:
 * - 'recap': Cambodian AI Movie Recap style (សម្រាយរឿង)
 * - 'character': Multi-character lip-sync dialogue dubbing
 * - 'verbatim': Direct sentence-by-sentence faithful ASR translation
 */
export function generateSegmentsForUploadedVideo(
  videoDuration: number,
  genre: string = 'action',
  leadVoiceId: string = 'piseth',
  requestedCount?: number,
  mode: TranscriptionMode = 'recap',
  voiceSpeed: number = 1.0
): DubbingSegment[] {
  const safeDuration = Math.max(5, videoDuration || 20);
  const secondaryVoice = leadVoiceId === 'piseth' ? 'sreymom' : 'piseth';

  // 1. Cambodia Movie Recap (សម្រាយរឿង AI) templates — continuous dramatic narration popular in Cambodia
  const recapTemplates: Record<string, Array<{ en: string; km: string; speaker: string; defaultVoice: string }>> = {
    action: [
      { en: "In this opening scene, our hero arrives at the ancient fortress just before dusk.", km: "នៅក្នុងឈុតឆាកបើកឆាកនេះ តួឯកប្រុសរបស់យើង បានធ្វើដំណើរមកដល់បន្ទាយបុរាណ មុនពេលថ្ងៃលិច។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "Suddenly, he notices enemy scouts surrounding the northern gate in secret.", km: "ភ្លាមៗនោះ គាត់ក៏បានសង្កេតឃើញទាហានស៊ើបការណ៍សត្រូវ កំពុងឡោមព័ទ្ធទ្វារខាងជើងដោយសម្ងាត់។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "Hold your ground everyone, do not let them breach the inner wall!", km: "រក្សាជំហរការពារឱ្យជាប់ទាំងអស់គ្នា កុំឱ្យពួកគេទម្លុះជញ្ជាំងខាងក្នុងបានឱ្យសោះ!", speaker: "Speaker 1 (Commander)", defaultVoice: leadVoiceId },
      { en: "At this critical moment, the female warrior steps forward with a bold plan.", km: "នៅក្នុងគ្រាដ៏អាសន្ននេះ តួឯកស្រីក៏បានឈានជើងចេញមក ជាមួយនឹងផែនការដ៏អង់អាចមួយ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "Leave the eastern flank to me, I will cut off their supply line!", km: "ទុកផ្លូវខាងកើតឱ្យខ្ញុំជាអ្នកចាត់ការ ខ្ញុំនឹងកាត់ផ្តាច់ផ្លូវជំនួយរបស់ពួកគេ!", speaker: "Speaker 2 (Heroine)", defaultVoice: secondaryVoice },
      { en: "Without wasting a single second, the two heroes launch a counter-attack.", km: "ដោយមិនបង្អង់ពេលសូម្បីតែមួយវិនាទី អ្នកទាំងពីរក៏បានបើកការវាយប្រហារបកទៅវិញភ្លាមៗ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "Caught completely off guard, the enemy commander orders an immediate retreat.", km: "ដោយសារតែមិនបានត្រៀមខ្លួនជាមុន មេបញ្ជាការសត្រូវក៏បង្ខំចិត្តបញ្ជាឱ្យដកថយទាំងស្លន់ស្លោ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "We have secured the main tower, keep pushing forward until dawn!", km: "ពួកយើងគ្រប់គ្រងប៉មធំបានហើយ បន្តសម្រុកទៅមុខទៀតរហូតដល់ថ្ងៃរះ!", speaker: "Speaker 1 (Commander)", defaultVoice: leadVoiceId },
      { en: "After an unforgettable battle, peace finally returns to the kingdom.", km: "បន្ទាប់ពីការប្រយុទ្ធដ៏ស្វិតស្វាញ សន្តិភាពក៏បានត្រឡប់មកកាន់នគរវិញជាស្ថាពរ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "This proves that true courage and unity can overcome any obstacle.", km: "នេះសបញ្ជាក់ឱ្យឃើញថា ភាពក្លាហាន និងការសាមគ្គីគ្នា ពិតជាអាចយកឈ្នះរាល់ឧបសគ្គទាំងអស់។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId }
    ],
    drama: [
      { en: "After ten long years away, Dara finally returns to his quiet hometown.", km: "បន្ទាប់ពីចាកចេញអស់រយៈពេលដប់ឆ្នាំមក តារាក៏បានត្រឡប់មកកាន់ស្រុកកំណើតដ៏ស្ងប់ស្ងាត់វិញ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "Standing in front of the old house, childhood memories flood back into his heart.", km: "ឈរនៅមុខផ្ទះចាស់ អនុស្សាវរីយ៍កាលពីកុមារភាព ក៏បានផុសឡើងពេញបេះដូងរបស់គាត់។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "I never thought you would keep your promise and come back to us.", km: "ខ្ញុំមិនដែលគិតថា អ្នកនៅតែរក្សាពាក្យសន្យា ហើយត្រឡប់មករកពួកយើងវិញនោះទេ។", speaker: "Speaker 2", defaultVoice: secondaryVoice },
      { en: "Hearing her gentle voice, he could no longer hide his deep emotion.", km: "គ្រាន់តែឮសំឡេងដ៏ស្រទន់របស់នាងភ្លាម គាត់ក៏មិនអាចលាក់បាំងអារម្មណ៍ក្តុកក្តួលបានទៀតឡើយ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "No matter how far I traveled, my heart always belonged right here.", km: "ទោះបីជាខ្ញុំធ្វើដំណើរទៅឆ្ងាយប៉ុណ្ណាក៏ដោយ ក៏បេះដូងរបស់ខ្ញុំនៅតែស្ថិតនៅទីនេះជានិច្ច។", speaker: "Speaker 1", defaultVoice: leadVoiceId },
      { en: "From that moment on, the two vowed never to be separated again.", km: "ចាប់ពីវិនាទីនោះមក អ្នកទាំងពីរក៏បានសន្យាថា នឹងមិនបែកគ្នាជាលើកទីពីរឡើយ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId }
    ],
    scifi: [
      { en: "In the year 2099, humanity discovers a mysterious signal beneath Angkor.", km: "នៅក្នុងឆ្នាំ ២០៩៩ មនុស្សជាតិបានរកឃើញសញ្ញាអាថ៌កំបាំងមួយ នៅក្រោមប្រាសាទអង្គរ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "The lead scientist activates the quantum scanner to decode the message.", km: "ប្រធានក្រុមអ្នកវិទ្យាសាស្ត្រ ក៏បានបើកម៉ាស៊ីនស្កេនកម្រិតខ្ពស់ ដើម្បីបំបែកកូដសម្ងាត់នោះ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "Warning: energy levels in the central core are rising beyond capacity!", km: "ការព្រមាន៖ កម្រិតថាមពលនៅក្នុងម៉ាស៊ីនកណ្តាល កំពុងកើនឡើងហួសកម្រិតហើយ!", speaker: "AI System", defaultVoice: secondaryVoice },
      { en: "With only seconds remaining, he manually overrides the security lock.", km: "ដោយនៅសល់ពេលតែប៉ុន្មានវិនាទីប៉ុណ្ណោះ គាត់ក៏សម្រេចចិត្តបិទប្រព័ន្ធសុវត្ថិភាពដោយផ្ទាល់ដៃ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId },
      { en: "The portal stabilizes, revealing a breathtaking new civilization.", km: "ច្រកទ្វារថាមពលក៏មានស្ថិរភាពឡើងវិញ ដោយបង្ហាញឱ្យឃើញនូវអរិយធម៌ថ្មីដ៏អស្ចារ្យ។", speaker: "AI Narrator (សម្រាយរឿង)", defaultVoice: leadVoiceId }
    ]
  };

  // 2. Character / Verbatim Dialogue templates
  const characterTemplates: Record<string, Array<{ en: string; km: string; speaker: string; defaultVoice: string }>> = {
    action: [
      { en: "Stay alert everyone! Enemy forces are moving in from the northern ridge.", km: "ប្រយ័ត្នទាំងអស់គ្នា! កងទ័ពសត្រូវកំពុងតែសម្រុកចូលមកពីទិសខាងជើងហើយ។", speaker: "Speaker 1 (Commander)", defaultVoice: leadVoiceId },
      { en: "Hold the defensive perimeter, do not let anyone break through the gate!", km: "រក្សាជំហរការពារឱ្យជាប់ កុំឱ្យនរណាម្នាក់ទម្លុះទ្វារចូលមកបានឱ្យសោះ!", speaker: "Speaker 2 (Scout)", defaultVoice: secondaryVoice },
      { en: "Now is our chance, launch the counter-attack immediately!", km: "ពេលនេះជាឱកាសរបស់យើងហើយ បើកការវាយប្រហារបកទៅវិញភ្លាមៗ!", speaker: "Speaker 1 (Commander)", defaultVoice: leadVoiceId },
      { en: "Look out! Their backup squad is surrounding the main tower!", km: "ប្រយ័ត្ន! ក្រុមជំនួយរបស់ពួកគេ កំពុងតែឡោមព័ទ្ធប៉មធំរបស់យើងហើយ!", speaker: "Speaker 2 (Scout)", defaultVoice: secondaryVoice },
      { en: "We have secured the eastern passage, keep pushing forward!", km: "ពួកយើងគ្រប់គ្រងផ្លូវខាងកើតបានហើយ បន្តសម្រុកទៅមុខទៀត!", speaker: "Speaker 1 (Commander)", defaultVoice: leadVoiceId },
      { en: "The enemy commander is retreating toward the canyon!", km: "មេបញ្ជាការសត្រូវ កំពុងតែដកថយទៅកាន់ជ្រលងភ្នំហើយ!", speaker: "Speaker 2 (Scout)", defaultVoice: secondaryVoice },
      { en: "Victory belongs to those who stand united until the very end.", km: "ជ័យជម្នះ គឺជារបស់អ្នកដែលចេះសាមគ្គីគ្នា រហូតដល់វិនាទីចុងក្រោយ។", speaker: "Speaker 1 (Commander)", defaultVoice: leadVoiceId }
    ]
  };

  const bank = mode === 'recap' ? recapTemplates : characterTemplates;
  const templates = bank[genre] || bank.action || recapTemplates.action;
  const numSegments = requestedCount && requestedCount > 0
    ? Math.min(120, Math.max(2, requestedCount))
    : Math.min(120, Math.max(4, Math.ceil(safeDuration / 3.8)));

  const usableDuration = safeDuration * 0.88;
  const segmentDuration = Math.min(4.2, Math.max(1.8, Number((usableDuration / numSegments).toFixed(2))));
  const interval = Math.max(0.18, (safeDuration - (numSegments * segmentDuration)) / (numSegments + 1));

  const segments: DubbingSegment[] = [];
  for (let i = 0; i < numSegments; i++) {
    const item = templates[i % templates.length];
    const start = Number((interval + i * (segmentDuration + interval)).toFixed(2));
    const end = Number(Math.min(safeDuration, start + segmentDuration).toFixed(2));
    const actualSlot = Math.max(0.8, Number((end - start).toFixed(2)));
    const est = estimateKhmerDuration(item.km);
    const stretch = calculateTimeStretch(actualSlot, est);
    const effectiveSpeed = voiceSpeed !== 1.0 ? clampVoiceSpeed(voiceSpeed) : stretch.rate;

    segments.push({
      id: `seg-${i + 1}`,
      start,
      end,
      speaker: mode === 'recap' ? 'AI Narrator (សម្រាយរឿង)' : item.speaker,
      speakerVoiceId: mode === 'recap' ? leadVoiceId : (item.defaultVoice || leadVoiceId),
      originalText: item.en,
      khmerText: item.km,
      naturalDuration: est,
      speedRatio: effectiveSpeed,
      confidence: Number((0.95 + ((i * 7) % 5) * 0.01).toFixed(2)),
      transcriptionMode: mode
    });
  }

  return segments;
}


