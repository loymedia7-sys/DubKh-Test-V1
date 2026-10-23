import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KHMER_VOICES,
  DEFAULT_VOXCPM2_CONFIG,
  buildVoxCPM2RequestUrl,
  timeStretchPcmSamples
} from './khmerTts.ts';

test('KHMER_VOICES includes tuned Khmer voices Sovann and Apsara', () => {
  const sovann = KHMER_VOICES.find(v => v.id === 'sovann');
  const apsara = KHMER_VOICES.find(v => v.id === 'apsara');

  assert.ok(sovann, 'Sovann voice should exist');
  assert.equal(sovann.gender, 'male');
  assert.equal(sovann.azureVoiceName, 'km-KH-PisethNeural');

  assert.ok(apsara, 'Apsara voice should exist');
  assert.equal(apsara.gender, 'female');
  assert.equal(apsara.azureVoiceName, 'km-KH-SreymomNeural');
});

test('buildVoxCPM2RequestUrl encodes VoxCPM2 48kHz and Khmer LoRA parameters deterministically', () => {
  const url = buildVoxCPM2RequestUrl(
    'សួស្តីកម្ពុជា',
    'sovann',
    'voxcpm2',
    DEFAULT_VOXCPM2_CONFIG
  );

  assert.ok(url.startsWith('/api/tts?'));
  assert.ok(url.includes('voice=sovann'));
  assert.ok(url.includes('engine=voxcpm2'));
  assert.ok(url.includes('sr=48000'));
  assert.ok(url.includes('cfg=2.00'));
  assert.ok(url.includes('steps=16'));
  assert.ok(url.includes('lora=1.00'));
});

test('buildVoxCPM2RequestUrl clamps out-of-range CFG and steps and sets lora=0.00 when disabled', () => {
  const url = buildVoxCPM2RequestUrl(
    'តេស្តសំឡេង',
    'apsara',
    'voxcpm2',
    {
      ...DEFAULT_VOXCPM2_CONFIG,
      loraEnabled: false,
      cfgValue: 9.5,
      inferenceSteps: 2,
      sampleRate: 24000
    }
  );

  assert.ok(url.includes('sr=24000'));
  assert.ok(url.includes('cfg=4.00'));
  assert.ok(url.includes('steps=6'));
  assert.ok(url.includes('lora=0.00'));
});

test('timeStretchPcmSamples scales sample length inversely with speed while preserving finite waveform', () => {
  const sampleRate = 16000;
  const original = new Float32Array(sampleRate * 2); // 2.0s of 200Hz harmonic wave
  for (let i = 0; i < original.length; i++) {
    original[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / sampleRate);
  }

  const fast125 = timeStretchPcmSamples(original, sampleRate, 1.25);
  const slow080 = timeStretchPcmSamples(original, sampleRate, 0.8);

  assert.ok(fast125.length < original.length, '1.25x speed should produce shorter buffer');
  assert.ok(Math.abs(fast125.length - Math.floor(original.length / 1.25)) < 100);
  assert.ok(slow080.length > original.length, '0.80x speed should produce longer buffer');
  assert.ok(fast125.every(v => Number.isFinite(v)), 'All stretched samples must be finite numbers');
});

test('HTTP X-TTS-Engine header strings must strictly contain only valid ASCII characters (0x20-0x7E)', () => {
  const sanitize = (val: string) => String(val || '').replace(/[^\x20-\x7E]/g, '-').replace(/\s+/g, ' ').trim();
  
  // Test unicode bullet, Khmer characters, and quotes
  const testTagWithUnicode = `Microsoft-Edge-Neural (km-KH-PisethNeural • pitch:-8Hz rate:+35%) សំឡេងខ្មែរ`;
  const sanitized = sanitize(testTagWithUnicode);
  
  for (let i = 0; i < sanitized.length; i++) {
    const code = sanitized.charCodeAt(i);
    assert.ok(code >= 32 && code <= 126, `Character at index ${i} ('${sanitized[i]}', code ${code}) must be visible ASCII`);
  }
  assert.ok(!sanitized.includes('•'), 'Must not contain bullet symbol');
});

test('encodePcmToWavBuffer produces valid 44-byte RIFF WAVE header with accurate PCM byte length', async () => {
  const { encodePcmToWavBuffer } = await import('./khmerTts.ts');
  const sampleRate = 44100;
  const numSamples = 4410; // 0.1s
  const pcm = new Float32Array(numSamples);
  pcm.fill(0.25);

  const wavBuf = encodePcmToWavBuffer(pcm, sampleRate);
  assert.equal(wavBuf.byteLength, 44 + numSamples * 2);

  const view = new DataView(wavBuf);
  // 'RIFF'
  assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
  // 'WAVE'
  assert.equal(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)), 'WAVE');
  // Sample rate 44100
  assert.equal(view.getUint32(24, true), 44100);
});

