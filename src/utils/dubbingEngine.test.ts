import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSrtTime,
  formatSrtTime,
  formatVttTime,
  estimateKhmerDuration,
  calculateTimeStretch,
  clampVoiceSpeed,
  calculateEffectiveSpeechDuration,
  applyVoiceSpeedToSegments,
  parseScriptOrSrtToSegments,
  sanitizeTranscribedSegments,
  generateSrt,
  generateVtt,
  calculateDuckingGain,
  getStageProgress,
  generateSegmentsForUploadedVideo,
  calculateAutoFitTiming,
  autoAlignTimeframesToSpeech
} from './dubbingEngine.ts';
import type { DubbingSegment } from './dubbingEngine.ts';

test('parseSrtTime converts SRT timestamp to seconds accurately', () => {
  assert.equal(parseSrtTime('00:00:05,250'), 5.25);
  assert.equal(parseSrtTime('00:01:30.500'), 90.5);
  assert.equal(parseSrtTime('01:00:00,000'), 3600);
  assert.equal(parseSrtTime(''), 0);
});

test('formatSrtTime formats seconds into HH:MM:SS,mmm', () => {
  assert.equal(formatSrtTime(0), '00:00:00,000');
  assert.equal(formatSrtTime(5.25), '00:00:05,250');
  assert.equal(formatSrtTime(90.5), '00:01:30,500');
  assert.equal(formatSrtTime(3661.123), '01:01:01,123');
});

test('formatVttTime formats seconds into HH:MM:SS.mmm', () => {
  assert.equal(formatVttTime(12.345), '00:00:12.345');
});

test('estimateKhmerDuration calculates reasonable speech time', () => {
  const shortText = 'សួស្តី';
  const durationShort = estimateKhmerDuration(shortText);
  assert.ok(durationShort >= 0.6, 'Should enforce minimum duration');

  const longText = 'យើងត្រូវតែប្រញាប់ប្រញាល់ចេញពីទីនេះ មុនពេលទាហានសត្រូវមកដល់!';
  const durationLong = estimateKhmerDuration(longText);
  assert.ok(durationLong > durationShort, 'Long text should take longer than short text');
});

test('calculateTimeStretch handles optimal, compressed, and critical timing', () => {
  // 3s slot, 3s speech -> rate 1.0 optimal
  const optimal = calculateTimeStretch(3.0, 3.0);
  assert.equal(optimal.rate, 1.0);
  assert.equal(optimal.status, 'optimal');
  assert.equal(optimal.isOverflow, false);

  // 2s slot, 2.7s speech -> rate 1.35 compressed
  const compressed = calculateTimeStretch(2.0, 2.7);
  assert.equal(compressed.rate, 1.35);
  assert.equal(compressed.isOverflow, true);

  // 1s slot, 2.5s speech -> rate clamped to max 1.80 (Nice One Dubber max limit) and critical
  const critical = calculateTimeStretch(1.0, 2.5);
  assert.equal(critical.rate, 1.8);
  assert.equal(critical.status, 'critical');
  assert.equal(critical.isSevereOverflow, true);

  // If explicit maxRate is 1.6
  const customLimit = calculateTimeStretch(1.0, 2.5, 1.6);
  assert.equal(customLimit.rate, 1.6);
});

test('generateSrt produces valid SRT format', () => {
  const segments: DubbingSegment[] = [
    {
      id: 'seg-1',
      start: 1.0,
      end: 3.5,
      speaker: 'Speaker 1',
      speakerVoiceId: 'piseth',
      originalText: 'Look at the mountain.',
      khmerText: 'មើលទៅភ្នំនោះមើល។'
    },
    {
      id: 'seg-2',
      start: 4.0,
      end: 6.2,
      speaker: 'Speaker 2',
      speakerVoiceId: 'sreymom',
      originalText: 'It is so beautiful.',
      khmerText: 'វាពិតជាស្រស់ស្អាតខ្លាំងណាស់!'
    }
  ];

  const srt = generateSrt(segments);
  assert.ok(srt.includes('1\n00:00:01,000 --> 00:00:03,500\nមើលទៅភ្នំនោះមើល។'));
  assert.ok(srt.includes('2\n00:00:04,000 --> 00:00:06,200\nវាពិតជាស្រស់ស្អាតខ្លាំងណាស់!'));
});

test('calculateDuckingGain ducks BGM during speech and restores outside', () => {
  const segments: DubbingSegment[] = [
    {
      id: 'seg-1',
      start: 5.0,
      end: 10.0,
      speaker: 'Narrator',
      speakerVoiceId: 'borey',
      originalText: 'Hello',
      khmerText: 'សួស្តី'
    }
  ];

  const config = {
    bgmVolume: 0.8,
    voiceVolume: 1.0,
    duckingThreshold: 0.2,
    attackTime: 0.2,
    releaseTime: 0.5,
    muteOriginalVoice: false,
    originalAudioMode: 'duck_dialogue' as const
  };

  // At t=2s (no speech)
  const quiet = calculateDuckingGain(2.0, segments, config);
  assert.equal(quiet.bgmGain, 0.8);
  assert.equal(quiet.voiceGain, 0);

  // At t=7s (during speech)
  const speech = calculateDuckingGain(7.0, segments, config);
  assert.equal(speech.bgmGain, 0.2);
  assert.equal(speech.voiceGain, 1.0);
  assert.ok(speech.activeSegment !== null);
});

test('getStageProgress returns monotonically ordered percentages for stages', () => {
  assert.equal(getStageProgress('idle'), 0);
  assert.equal(getStageProgress('download'), 12);
  assert.equal(getStageProgress('translate'), 72);
  assert.equal(getStageProgress('completed'), 100);
});

test('generateSegmentsForUploadedVideo generates valid segments within video bounds', () => {
  const duration = 25.0;
  const segments = generateSegmentsForUploadedVideo(duration, 'action', 'piseth');
  assert.ok(segments.length >= 2, 'Should generate multiple segments');
  
  for (const seg of segments) {
    assert.ok(seg.start >= 0, 'Start time should be non-negative');
    assert.ok(seg.end <= duration, `End time (${seg.end}) must not exceed video duration (${duration})`);
    assert.ok(seg.end > seg.start, 'End time should be after start time');
    assert.ok(seg.khmerText.length > 0, 'Khmer text should be populated');
  }
});

test('generateSegmentsForUploadedVideo scales across full movie duration without capping at 4-5 lines', () => {
  const fullMovieDuration = 120.0; // 2-minute movie scene
  const segments = generateSegmentsForUploadedVideo(fullMovieDuration, 'action', 'piseth');
  assert.ok(segments.length >= 25, `Should generate full movie coverage (>=25 segments), got ${segments.length}`);
  const lastSeg = segments[segments.length - 1];
  assert.ok(lastSeg.end >= 110.0, `Last segment should reach near the end of the 120s movie, got ${lastSeg.end}`);
});

test('clampVoiceSpeed and calculateEffectiveSpeechDuration adjust speech duration accurately for 0.5x to 2.0x', () => {
  assert.equal(clampVoiceSpeed(0.2), 0.5);
  assert.equal(clampVoiceSpeed(1.25), 1.25);
  assert.equal(clampVoiceSpeed(3.0), 2.0);

  const sampleText = 'នៅក្នុងឈុតឆាកបើកឆាកនេះ តួឯកប្រុសរបស់យើង បានធ្វើដំណើរមកដល់បន្ទាយបុរាណ មុនពេលថ្ងៃលិច។';
  const d1 = calculateEffectiveSpeechDuration(sampleText, 1.0, 1.0);
  const dFast = calculateEffectiveSpeechDuration(sampleText, 1.25, 1.0);
  const dSlow = calculateEffectiveSpeechDuration(sampleText, 0.8, 1.0);

  assert.ok(dFast < d1, 'Faster speed (1.25x) should shorten effective duration');
  assert.ok(dSlow > d1, 'Slower speed (0.8x) should lengthen effective duration');
});

test('parseScriptOrSrtToSegments parses SRT blocks and multi-line scripts into time-aligned DubbingSegments', () => {
  const srtSample = `1\n00:00:01,500 --> 00:00:04,500\nនៅក្នុងឈុតនេះ តួឯកបានរកឃើញផែនទីសម្ងាត់។\n\n2\n00:00:05,000 --> 00:00:08,200\nភ្លាមៗនោះ សត្រូវក៏បានសម្រុកចូលមក។`;
  const parsedSrt = parseScriptOrSrtToSegments(srtSample, 20, 'piseth', 1.15);
  assert.equal(parsedSrt.length, 2);
  assert.equal(parsedSrt[0].start, 1.5);
  assert.equal(parsedSrt[0].end, 4.5);
  assert.equal(parsedSrt[0].speedRatio, 1.15);

  const plainScript = `Speaker 1: យើងត្រូវតែការពារទីក្រុងនេះ!\nSpeaker 2: ខ្ញុំត្រៀមខ្លួនរួចរាល់ហើយ!`;
  const parsedPlain = parseScriptOrSrtToSegments(plainScript, 16, 'sreymom', 1.25);
  assert.equal(parsedPlain.length, 2);
  assert.equal(parsedPlain[0].speaker, 'Speaker 1');
  assert.equal(parsedPlain[0].speedRatio, 1.25);
});

test('sanitizeTranscribedSegments preserves real ASR lines and timestamps without appending fake movie lines', () => {
  const rawAsr = [
    {
      start: 1.2,
      end: 3.8,
      speaker: 'Speaker 1',
      speakerVoiceId: 'piseth',
      originalText: 'Look out, someone is coming through the door right now.',
      khmerText: 'ប្រយ័ត្ន! មានមនុស្សកំពុងដើរចូលតាមទ្វារឥឡូវនេះហើយ។',
      confidence: 0.99
    },
    {
      start: 5.0,
      end: 7.5,
      speaker: 'Speaker 2',
      speakerVoiceId: 'sreymom',
      originalText: 'Stay quiet and follow me.',
      khmerText: 'រក្សាភាពស្ងៀមស្ងាត់ ហើយដើរតាមខ្ញុំ។',
      confidence: 0.98
    }
  ];

  const sanitized = sanitizeTranscribedSegments(rawAsr, 30, 'piseth', 1.0, 'verbatim');
  // Must preserve exact count (2 lines) and never pad with fake template lines up to 30s
  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].start, 1.2);
  assert.equal(sanitized[0].end, 3.8);
  assert.equal(sanitized[0].originalText, 'Look out, someone is coming through the door right now.');
  assert.equal(sanitized[1].start, 5.0);
  assert.equal(sanitized[1].end, 7.5);
  assert.equal(sanitized[1].speakerVoiceId, 'sreymom');
});

test('calculateAutoFitTiming identifies rushed lines and clamps speech speed to max 1.80x', () => {
  const sampleSegs: DubbingSegment[] = [
    {
      id: 'seg-short',
      start: 1.0,
      end: 2.0, // 1.0s slot
      speaker: 'Speaker 1',
      speakerVoiceId: 'piseth',
      originalText: 'Hurry up!',
      khmerText: 'រួសរាន់ឡើង ពួកយើងគ្មានពេលច្រើនទៀតទេ!', // Natural duration ~2.0s
      naturalDuration: 2.0
    },
    {
      id: 'seg-spacious',
      start: 3.0,
      end: 8.0, // 5.0s slot
      speaker: 'Speaker 2',
      speakerVoiceId: 'sreymom',
      originalText: 'I understand.',
      khmerText: 'ខ្ញុំយល់ហើយ។', // Natural duration ~0.8s
      naturalDuration: 0.8
    }
  ];

  const result = calculateAutoFitTiming(sampleSegs, 1.80);
  assert.equal(result.maxSpeedLimit, 1.80);
  // seg-short requires 2.0 / 1.0 = 2.0x, clamped to 1.80x, which is >= 1.20x so it is rushed
  assert.equal(result.rushedLinesCount, 1);
  assert.equal(result.optimalLinesCount, 1);
  assert.equal(result.segments[0].speedRatio, 1.80);
});

test('autoAlignTimeframesToSpeech aligns segments to natural duration at 1.0x speed without cutting off', () => {
  const sampleSegs: DubbingSegment[] = [
    {
      id: 'seg-1',
      start: 1.0,
      end: 2.0, // only 1s slot
      speaker: 'Speaker 1',
      speakerVoiceId: 'piseth',
      originalText: 'Hello there everyone.',
      khmerText: 'សួស្តីបងប្អូនទាំងអស់គ្នា ថ្ងៃនេះយើងនឹងនាំអ្នកទាំងអស់គ្នាទៅមើលរឿងថ្មីមួយ។', // Takes ~3.5s
      naturalDuration: 3.5
    },
    {
      id: 'seg-2',
      start: 2.5,
      end: 3.5, // Would have overlapped with seg-1's speech
      speaker: 'Speaker 2',
      speakerVoiceId: 'sreymom',
      originalText: 'Yes, this is thrilling.',
      khmerText: 'ពិតមែនហើយ គឺរឿងនេះល្អមើលខ្លាំងណាស់!', // Takes ~2.0s
      naturalDuration: 2.0
    }
  ];

  const aligned10 = autoAlignTimeframesToSpeech(sampleSegs, 0.30, 1.0);
  assert.equal(aligned10.segments.length, 2);
  // seg-1 should have start 1.0, end = 1.0 + 3.5 = 4.5
  assert.equal(aligned10.segments[0].start, 1.0);
  assert.equal(aligned10.segments[0].end, 4.5);
  assert.equal(aligned10.segments[0].speedRatio, 1.0);

  // seg-2 should be shifted past seg-1's end + 0.30 breathGap = 4.8
  assert.equal(aligned10.segments[1].start, 4.8);
  assert.equal(aligned10.segments[1].end, 6.8);
  assert.equal(aligned10.segments[1].speedRatio, 1.0);

  // Test default 0.88x
  const aligned088 = autoAlignTimeframesToSpeech(sampleSegs, 0.30);
  assert.equal(aligned088.segments[0].speedRatio, 0.88);
  assert.equal(aligned088.segments[0].end, 4.98); // 1.0 + 3.5 / 0.88
});

test('autoAlignTimeframesToSpeech supports fixedSlotDuration 4.3s at 0.88x for all lines', () => {
  const sampleSegs: DubbingSegment[] = [
    {
      id: 'seg-1',
      start: 1.0,
      end: 2.0,
      speaker: 'Speaker 1',
      speakerVoiceId: 'piseth',
      originalText: 'Line one text.',
      khmerText: 'អត្ថបទទីមួយ',
      naturalDuration: 3.78
    },
    {
      id: 'seg-2',
      start: 2.5,
      end: 3.5,
      speaker: 'Speaker 2',
      speakerVoiceId: 'sreymom',
      originalText: 'Line two text.',
      khmerText: 'អត្ថបទទីពីរ',
      naturalDuration: 3.78
    }
  ];

  const aligned = autoAlignTimeframesToSpeech(sampleSegs, 0.30, 0.88, 4.3);
  assert.equal(aligned.segments.length, 2);
  assert.equal(aligned.segments[0].start, 1.0);
  assert.equal(aligned.segments[0].end, 5.3); // 1.0 + 4.3
  assert.equal(aligned.segments[0].speedRatio, 0.88);
  assert.equal(Number((aligned.segments[0].end - aligned.segments[0].start).toFixed(1)), 4.3);

  // Second line starts at 5.3 + 0.30 = 5.6
  assert.equal(aligned.segments[1].start, 5.6);
  assert.equal(aligned.segments[1].end, 9.9); // 5.6 + 4.3
  assert.equal(Number((aligned.segments[1].end - aligned.segments[1].start).toFixed(1)), 4.3);

  // calculateEffectiveSpeechDuration calculates ~4.3s
  const effDur = calculateEffectiveSpeechDuration(aligned.segments[0].khmerText, 0.88, 1.0, aligned.segments[0].naturalDuration);
  assert.equal(Number(effDur.toFixed(1)), 4.3);
});

