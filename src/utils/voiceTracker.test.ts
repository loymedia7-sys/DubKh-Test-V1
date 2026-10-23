import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVoicePeaksFromSamples,
  generateSyntheticVoicePeaks,
  alignSegmentsToVoicePeaks,
  generateWaveformProfile,
  type VoicePeak
} from './voiceTracker.ts';
import type { DubbingSegment } from './dubbingEngine.ts';

test('detectVoicePeaksFromSamples detects active speech bursts separated by silence', () => {
  const sampleRate = 8000;
  const duration = 6; // 6 seconds
  const totalSamples = sampleRate * duration;
  const samples = new Float32Array(totalSamples);

  // Add silence (0-1s)
  // Add burst 1: 1s to 2.5s (speech frequency 400Hz + amplitude 0.8)
  for (let i = sampleRate * 1; i < sampleRate * 2.5; i++) {
    samples[i] = Math.sin((i / sampleRate) * 400 * 2 * Math.PI) * 0.8;
  }

  // Add silence: 2.5s to 3.5s
  // Add burst 2: 3.5s to 5s
  for (let i = Math.floor(sampleRate * 3.5); i < sampleRate * 5; i++) {
    samples[i] = Math.sin((i / sampleRate) * 350 * 2 * Math.PI) * 0.75;
  }

  const peaks = detectVoicePeaksFromSamples(samples, sampleRate, 0.5, 0.2);
  assert.ok(peaks.length >= 2, `Should detect at least 2 voice bursts, got ${peaks.length}`);
  assert.ok(peaks[0].start >= 0.8 && peaks[0].start <= 1.2, `Peak 1 start should be ~1s, got ${peaks[0].start}`);
  assert.ok(peaks[0].end >= 2.2 && peaks[0].end <= 2.8, `Peak 1 end should be ~2.5s, got ${peaks[0].end}`);
});

test('generateSyntheticVoicePeaks bounds peaks to video duration', () => {
  const peaks = generateSyntheticVoicePeaks(25.0, 4);
  assert.equal(peaks.length, 4);
  for (const peak of peaks) {
    assert.ok(peak.start >= 0);
    assert.ok(peak.end <= 25.0);
    assert.ok(peak.end > peak.start);
    assert.ok(peak.duration >= 1.5);
  }
});

test('alignSegmentsToVoicePeaks snaps cues to voice peak timestamps', () => {
  const segments: DubbingSegment[] = [
    {
      id: 'seg-1',
      start: 0,
      end: 2,
      speaker: 'Speaker 1',
      speakerVoiceId: 'piseth',
      originalText: 'Hello',
      khmerText: 'សួស្តី'
    },
    {
      id: 'seg-2',
      start: 3,
      end: 5,
      speaker: 'Speaker 2',
      speakerVoiceId: 'sreymom',
      originalText: 'World',
      khmerText: 'ពិភពលោក'
    }
  ];

  const peaks: VoicePeak[] = [
    { start: 1.5, end: 4.2, duration: 2.7, peakEnergy: 0.9, confidence: 0.95 },
    { start: 5.8, end: 9.1, duration: 3.3, peakEnergy: 0.85, confidence: 0.92 }
  ];

  const aligned = alignSegmentsToVoicePeaks(segments, peaks, 15.0);
  assert.equal(aligned[0].start, 1.5);
  assert.equal(aligned[0].end, 4.2);
  assert.equal(aligned[1].start, 5.8);
  assert.equal(aligned[1].end, 9.1);
  assert.ok(aligned[0].naturalDuration! > 0);
  assert.ok(aligned[0].speedRatio! > 0);
});

test('generateWaveformProfile outputs normalized points array', () => {
  const peaks: VoicePeak[] = [
    { start: 2, end: 6, duration: 4, peakEnergy: 0.8, confidence: 0.9 }
  ];
  const profile = generateWaveformProfile(peaks, 10, 64);
  assert.equal(profile.length, 64);
  for (const val of profile) {
    assert.ok(val >= 0 && val <= 1.0);
  }
  // Energy during peak window should be higher than baseline
  const midPoint = Math.floor((4 / 10) * 64);
  assert.ok(profile[midPoint] > 0.4);
});

test('detectVoicePeaksFromSamples isolates voice bursts above background music floor', () => {
  const sampleRate = 8000;
  const duration = 8;
  const totalSamples = sampleRate * duration;
  const samples = new Float32Array(totalSamples);

  // Fill with continuous background music floor (amplitude 0.12)
  for (let i = 0; i < totalSamples; i++) {
    samples[i] = Math.sin((i / sampleRate) * 180 * 2 * Math.PI) * 0.12;
  }

  // Add louder vocal burst 1: 1.0s - 2.6s (amplitude 0.85)
  for (let i = sampleRate * 1; i < Math.floor(sampleRate * 2.6); i++) {
    samples[i] += Math.sin((i / sampleRate) * 420 * 2 * Math.PI) * 0.85;
  }

  // Add louder vocal burst 2: 4.2s - 6.0s (amplitude 0.85)
  for (let i = Math.floor(sampleRate * 4.2); i < sampleRate * 6; i++) {
    samples[i] += Math.sin((i / sampleRate) * 380 * 2 * Math.PI) * 0.85;
  }

  const peaks = detectVoicePeaksFromSamples(samples, sampleRate, 0.5, 0.25);
  assert.equal(peaks.length, 2, `Should isolate 2 speech bursts over BGM floor, got ${peaks.length}`);
  assert.ok(peaks[0].start >= 0.8 && peaks[0].end <= 2.9);
  assert.ok(peaks[1].start >= 4.0 && peaks[1].end <= 6.3);
});

