import React, { useState } from 'react';
import { 
  Mic, Volume2, UserCheck, Sparkles, Sliders, 
  Wand2, Check, Cpu, Activity, Zap
} from 'lucide-react';
import { 
  KHMER_VOICES, 
  KhmerVoice, 
  khmerSynthesizer, 
  TtsEngineType, 
  VoxCPM2Config 
} from '../utils/khmerTts.ts';
import { DubbingSegment, VOICE_SPEED_PRESETS, clampVoiceSpeed } from '../utils/dubbingEngine.ts';

interface VoicePickerProps {
  segments: DubbingSegment[];
  onAssignSpeakerVoice: (speaker: string, voiceId: string) => void;
  voiceSpeed?: number;
  onVoiceSpeedChange?: (speed: number) => void;
  onOpenNiceOneDubberModal?: () => void;
}

export const VoicePicker: React.FC<VoicePickerProps> = ({
  segments,
  onAssignSpeakerVoice,
  voiceSpeed = 1.0,
  onVoiceSpeedChange,
  onOpenNiceOneDubberModal
}) => {
  const [selectedGender, setSelectedGender] = useState<'all' | 'male' | 'female'>('all');
  const [auditioningVoiceId, setAuditioningVoiceId] = useState<string | null>(null);
  const [ttsProvider, setTtsProvider] = useState<TtsEngineType>(() => khmerSynthesizer.getEngine());
  const [voxConfig, setVoxConfig] = useState<VoxCPM2Config>(() => khmerSynthesizer.getVoxCPM2Config());
  const [customTestText, setCustomTestText] = useState<string>(
    'សួស្តីអ្នកទាំងអស់គ្នា នេះជាសំឡេង AI ធម្មតាដែលគេនិយមប្រើសម្រាប់សម្រាយរឿងនៅប្រទេសកម្ពុជា។'
  );
  const [isAuditioningCustom, setIsAuditioningCustom] = useState(false);

  // Custom cloning / voice parameters synced with global voiceSpeed
  const [voiceParams, setVoiceParams] = useState({
    pitchShift: 1.0,
    speedRate: voiceSpeed || 1.0,
    resonance: 1.05
  });

  const activeSpeed = onVoiceSpeedChange ? voiceSpeed : voiceParams.speedRate;

  const handleSpeedUpdate = (newSpeed: number) => {
    const clamped = clampVoiceSpeed(newSpeed);
    setVoiceParams(prev => ({ ...prev, speedRate: clamped }));
    khmerSynthesizer.setMasterSpeed(clamped);
    if (onVoiceSpeedChange) onVoiceSpeedChange(clamped);
  };

  const uniqueSpeakers = Array.from(new Set(segments.map(s => s.speaker)));

  const handleEngineSwitch = (engine: TtsEngineType) => {
    setTtsProvider(engine);
    khmerSynthesizer.setEngine(engine);
  };

  const handleUpdateVoxConfig = (partial: Partial<VoxCPM2Config>) => {
    const updated = khmerSynthesizer.setVoxCPM2Config(partial);
    setVoxConfig(updated);
  };

  const handleAudition = async (voice: KhmerVoice) => {
    setAuditioningVoiceId(voice.id);
    await khmerSynthesizer.speak(
      voice.sampleAudioText,
      voice.id,
      activeSpeed,
      ttsProvider === 'voxcpm2' ? voice.voxcpm2Prompt : undefined
    );
    setTimeout(() => {
      setAuditioningVoiceId(null);
    }, 3500);
  };

  const handleAuditionVoxCPM2Design = async () => {
    setIsAuditioningCustom(true);
    const defaultVoiceId = segments[0]?.speakerVoiceId || 'piseth';
    await khmerSynthesizer.speak(
      customTestText,
      defaultVoiceId,
      activeSpeed,
      voxConfig.voiceDesignPrompt
    );
    setTimeout(() => {
      setIsAuditioningCustom(false);
    }, 3600);
  };

  const filteredVoices = selectedGender === 'all'
    ? KHMER_VOICES
    : KHMER_VOICES.filter(v => v.gender === selectedGender);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Mic className="w-4 h-4 text-amber-400" />
              <span className="font-kantumruy">ជ្រើសរើសសំឡេង AI ខ្មែរ</span>
              <span className="text-slate-400 font-normal">| Normal Cambodia AI & VoxCPM2 TTS</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Natural Cambodian AI voices used in Cambodia for movie recaps (សម្រាយរឿង) & full movie dubbing, plus VoxCPM2 48kHz.
            </p>
          </div>
        </div>

        {/* Engine Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs w-fit">
          <button
            onClick={() => handleEngineSwitch('cambodia_ai')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              ttsProvider === 'cambodia_ai'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Normal Cambodia AI (សំឡេង AI សម្រាយរឿងធម្មតា)</span>
          </button>
          <button
            onClick={() => handleEngineSwitch('voxcpm2')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              ttsProvider === 'voxcpm2'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>VoxCPM2 48kHz (Khmer LoRA)</span>
          </button>
          <button
            onClick={() => handleEngineSwitch('azure')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              ttsProvider === 'azure' 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Microsoft Edge Neural (Nice One Dubber)</span>
          </button>
          <button
            onClick={() => handleEngineSwitch('fish_audio')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              ttsProvider === 'fish_audio' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>Fish Audio Clone</span>
          </button>
        </div>
      </div>

      {/* Normal Cambodia AI Voice Banner */}
      {ttsProvider === 'cambodia_ai' && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-950 to-slate-950 border border-emerald-500/30 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap">
                <Check className="w-3 h-3" /> Standard Cambodia AI Voice (សំឡេង AI សម្រាយរឿងធម្មតា)
              </span>
              <span className="text-xs text-slate-400">
                {activeSpeed.toFixed(2)}x Pitch-Preserved Speed • Full Movie Ready
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  uniqueSpeakers.forEach(spk => onAssignSpeakerVoice(spk, 'piseth'));
                }}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                Use Normal Cambodia AI For Full Movie
              </button>
            </div>
          </div>

          {/* Voice Speed Control inside Voice Studio */}
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold text-slate-200 font-kantumruy">ល្បឿនសំឡេង (Voice Speed):</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                {activeSpeed.toFixed(2)}x
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {VOICE_SPEED_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSpeedUpdate(p.value)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                    Math.abs(activeSpeed - p.value) < 0.03
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {p.kmLabel}
                </button>
              ))}
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={activeSpeed}
                onChange={e => handleSpeedUpdate(parseFloat(e.target.value))}
                className="w-24 accent-emerald-400 cursor-pointer ml-1"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={customTestText}
              onChange={e => setCustomTestText(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-kantumruy focus:outline-none focus:border-emerald-500"
              placeholder="វាយអត្ថបទខ្មែរដើម្បីសាកល្បងសំឡេង AI ធម្មតា..."
            />
            <button
              onClick={handleAuditionVoxCPM2Design}
              disabled={isAuditioningCustom}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isAuditioningCustom ? `កំពុងនិយាយ (${activeSpeed.toFixed(2)}x)...` : `Test Normal Cambodia AI (${activeSpeed.toFixed(2)}x)`}</span>
            </button>
          </div>
        </div>
      )}

      {/* VoxCPM2 48kHz Khmer LoRA Architecture & Voice Design Studio */}
      {ttsProvider === 'voxcpm2' && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/25 via-slate-950 to-slate-950 border border-amber-500/30 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap">
                <Cpu className="w-3 h-3" /> OpenBMB VoxCPM2 (2B Diffusion)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-semibold whitespace-nowrap">
                {voxConfig.sampleRate / 1000}kHz WAV • Khmer LoRA MOS 4.23
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => handleUpdateVoxConfig({ loraEnabled: !voxConfig.loraEnabled })}
                className={`px-2.5 py-1 rounded-lg font-semibold border transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                  voxConfig.loraEnabled
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                <Check className="w-3 h-3" />
                <span>Khmer LoRA: {voxConfig.loraEnabled ? 'ON (MOS 4.23)' : 'OFF'}</span>
              </button>

              <button
                onClick={() => handleUpdateVoxConfig({ zeroShotCloneActor: !voxConfig.zeroShotCloneActor })}
                className={`px-2.5 py-1 rounded-lg font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                  voxConfig.zeroShotCloneActor
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                Zero-Shot Actor Clone: {voxConfig.zeroShotCloneActor ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={() => handleUpdateVoxConfig({ sampleRate: voxConfig.sampleRate === 48000 ? 24000 : 48000 })}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 font-mono text-[11px] whitespace-nowrap cursor-pointer"
                title="Toggle VoxCPM2 output sample rate"
              >
                {voxConfig.sampleRate} Hz
              </button>
            </div>
          </div>

          {/* VoxCPM2 Diffusion Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="flex justify-between text-slate-300 mb-1">
                <span className="font-semibold">Khmer LoRA Scale:</span>
                <span className="font-mono text-amber-300">{voxConfig.loraScale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                disabled={!voxConfig.loraEnabled}
                value={voxConfig.loraScale}
                onChange={e => handleUpdateVoxConfig({ loraScale: parseFloat(e.target.value) })}
                aria-label="Khmer LoRA Scale"
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Fine-tunes Khmer two-register phonation & clusters
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="flex justify-between text-slate-300 mb-1">
                <span className="font-semibold">CFG Guidance (Clarity):</span>
                <span className="font-mono text-amber-300">{voxConfig.cfgValue.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={4.0}
                step={0.1}
                value={voxConfig.cfgValue}
                onChange={e => handleUpdateVoxConfig({ cfgValue: parseFloat(e.target.value) })}
                aria-label="CFG Guidance"
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Flow-matching decoder prompt adherence (Default: 2.0)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="flex justify-between text-slate-300 mb-1">
                <span className="font-semibold">Diffusion Steps:</span>
                <span className="font-mono text-amber-300">{voxConfig.inferenceSteps} steps</span>
              </div>
              <input
                type="range"
                min={6}
                max={30}
                step={2}
                value={voxConfig.inferenceSteps}
                onChange={e => handleUpdateVoxConfig({ inferenceSteps: parseInt(e.target.value, 10) })}
                aria-label="Diffusion Steps"
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Continuous speech token diffusion steps (48kHz)
              </span>
            </div>
          </div>

          {/* VoxCPM2 Natural-Language Voice Design & Test Synthesis */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
            <div className="lg:col-span-6 space-y-1.5">
              <label htmlFor="voxcpm2-design-prompt" className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>VoxCPM2 Natural-Language Voice Design Prompt</span>
              </label>
              <input
                id="voxcpm2-design-prompt"
                type="text"
                value={voxConfig.voiceDesignPrompt}
                onChange={e => handleUpdateVoxConfig({ voiceDesignPrompt: e.target.value })}
                placeholder="Describe target voice timbre, age, emotion, and acoustic setting..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="lg:col-span-6 space-y-1.5">
              <label htmlFor="voxcpm2-test-khmer" className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Test Khmer Script with VoxCPM2 48kHz</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="voxcpm2-test-khmer"
                  type="text"
                  value={customTestText}
                  onChange={e => setCustomTestText(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-amber-200 font-kantumruy focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={handleAuditionVoxCPM2Design}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                    isAuditioningCustom
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isAuditioningCustom ? 'Playing 48kHz...' : 'Synthesize'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Microsoft Neural Voices (Edge TTS) • Nice One Dubber Movie Tuning Studio */}
      {ttsProvider === 'azure' && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/25 via-slate-950 to-slate-950 border border-blue-500/30 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap">
                <Sparkles className="w-3 h-3 text-amber-300" /> Microsoft Neural Voices (Edge TTS)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-semibold whitespace-nowrap">
                km-KH-PisethNeural & km-KH-SreymomNeural
              </span>
            </div>

            {onOpenNiceOneDubberModal && (
              <button
                onClick={onOpenNiceOneDubberModal}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                title="View Nice One Dubber & PyVideoTrans AI Workflow guide"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Nice One Dubber Tuning Specs</span>
              </button>
            )}
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <span className="font-bold text-amber-300 block font-kantumruy">
              របៀប Tune សំឡេងភាពយន្ត (Character Pitch & Rate Offsets on top of Piseth & Sreymom):
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Microsoft ផ្តល់សំឡេងខ្មែរចំនួន ២ (ប្រុស៖ <code className="text-amber-300">km-KH-PisethNeural</code>, ស្រី៖ <code className="text-rose-300">km-KH-SreymomNeural</code>)។ ដើម្បីឱ្យសំឡេងស្តាប់ទៅដូចជាអ្នកបញ្ចូលសំឡេងភាពយន្ត (Movie Dubber) មិនមែនជាអ្នកអានព័ត៌មាន Nice One Dubber បានកែប្រែ Pitch (Hz) និង Rate (%) បង្កើតបានជាតួអង្គច្រើនប្រភេទ៖
            </p>
          </div>

          {/* 7 Tuned Movie Dubbing Archetypes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {KHMER_VOICES.map(voice => {
              const isAuditioning = auditioningVoiceId === voice.id;
              return (
                <div
                  key={`azure-${voice.id}`}
                  className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-blue-500/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-white text-xs font-kantumruy">{voice.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold">
                        {voice.pitchOffsetHz >= 0 ? `+${voice.pitchOffsetHz}Hz` : `${voice.pitchOffsetHz}Hz`} • +{voice.rateOffsetPercent}%
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {voice.azureVoiceName}
                    </span>
                    <p className="text-[11px] text-slate-300 font-kantumruy mt-1.5 italic line-clamp-1">
                      "{voice.sampleAudioText}"
                    </p>
                  </div>

                  <div className="pt-2 mt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      {voice.gender === 'male' ? 'សំឡេងប្រុស' : 'សំឡេងស្រី'}
                    </span>
                    <button
                      onClick={() => handleAudition(voice)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        isAuditioning
                          ? 'bg-blue-600 text-white font-bold shadow-md'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>{isAuditioning ? 'Speaking...' : 'Play Tuned Voice'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Test Custom Khmer Text with Edge TTS */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-kantumruy">
              <Volume2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>សាកល្បងអត្ថបទខ្មែរជាមួយ Microsoft Neural (Piseth / Sreymom):</span>
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customTestText}
                onChange={e => setCustomTestText(e.target.value)}
                placeholder="វាយអត្ថបទខ្មែរដើម្បីសាកល្បងសំឡេង Microsoft Edge Neural..."
                className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-amber-200 font-kantumruy focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={async () => {
                    setIsAuditioningCustom(true);
                    await khmerSynthesizer.speak(customTestText, 'piseth', activeSpeed);
                    setTimeout(() => setIsAuditioningCustom(false), 3500);
                  }}
                  disabled={isAuditioningCustom}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Piseth (-8Hz)</span>
                </button>
                <button
                  onClick={async () => {
                    setIsAuditioningCustom(true);
                    await khmerSynthesizer.speak(customTestText, 'sreymom', activeSpeed);
                    setTimeout(() => setIsAuditioningCustom(false), 3500);
                  }}
                  disabled={isAuditioningCustom}
                  className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Sreymom (+5Hz)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Speaker to Voice Assignment Matrix */}
      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-sans">
          <UserCheck className="w-3.5 h-3.5" /> Character Speaker Diarization & Cast Matrix
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {uniqueSpeakers.map(speakerName => {
            const currentVoiceId = segments.find(s => s.speaker === speakerName)?.speakerVoiceId || 'piseth';
            const currentVoice = KHMER_VOICES.find(v => v.id === currentVoiceId) || KHMER_VOICES[0];

            return (
              <div key={speakerName} className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block truncate">{speakerName}</span>
                  <span className="text-[11px] text-slate-400 font-kantumruy block truncate">
                    {currentVoice.nameKhmer} ({currentVoice.style})
                  </span>
                </div>
                <select
                  aria-label={`Assign Khmer voice for ${speakerName}`}
                  value={currentVoiceId}
                  onChange={e => onAssignSpeakerVoice(speakerName, e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-semibold focus:outline-none cursor-pointer shrink-0 max-w-[190px]"
                >
                  {KHMER_VOICES.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice Library Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Available Khmer Voices ({filteredVoices.length})
          </span>
          {/* Gender Filter Buttons */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setSelectedGender('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                selectedGender === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedGender('male')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                selectedGender === 'male' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Male (ប្រុស)
            </button>
            <button
              onClick={() => setSelectedGender('female')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                selectedGender === 'female' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Female (ស្រី)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredVoices.map(voice => {
            const isAuditioning = auditioningVoiceId === voice.id;
            const isVoxNative = voice.id === 'sovann' || voice.id === 'apsara';

            return (
              <div 
                key={voice.id}
                className={`p-4 rounded-xl bg-slate-950 border transition-all flex flex-col justify-between group ${
                  isVoxNative
                    ? 'border-amber-500/40 shadow-md shadow-amber-500/5 hover:border-amber-400'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${voice.avatarColor} flex items-center justify-center text-white font-bold text-xs shadow-md`}>
                        {voice.gender === 'male' ? 'M' : 'F'}
                      </div>
                      <div>
                        <span className="font-bold text-sm text-white block">{voice.name}</span>
                        <span className="text-[11px] text-amber-400 font-medium">{voice.style}</span>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                      {voice.gender}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-2">
                    {voice.description}
                  </p>

                  <div className="p-2 rounded bg-slate-900/90 border border-slate-850 text-xs text-slate-300 font-kantumruy italic mb-3">
                    "{voice.sampleAudioText}"
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-amber-300/90 font-mono truncate">
                    {ttsProvider === 'voxcpm2' ? voice.voxcpm2ModelTag : voice.azureVoiceName.split(' ')[0]}
                  </span>
                  <button
                    onClick={() => {
                      if (ttsProvider === 'voxcpm2') {
                        handleUpdateVoxConfig({ voiceDesignPrompt: voice.voxcpm2Prompt });
                      }
                      handleAudition(voice);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                      isAuditioning
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{isAuditioning ? 'Auditioning...' : 'Play Sample'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice Tuning Sliders */}
      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          Global Voice Pitch & Cadence Modulation
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Pitch Shift:</span>
              <span className="font-mono text-white">{voiceParams.pitchShift.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.7}
              max={1.3}
              step={0.05}
              value={voiceParams.pitchShift}
              onChange={e => setVoiceParams({ ...voiceParams, pitchShift: parseFloat(e.target.value) })}
              aria-label="Pitch Shift"
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Speech Cadence Rate:</span>
              <span className="font-mono text-white">{voiceParams.speedRate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={1.4}
              step={0.05}
              value={voiceParams.speedRate}
              onChange={e => setVoiceParams({ ...voiceParams, speedRate: parseFloat(e.target.value) })}
              aria-label="Speech Cadence Rate"
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Resonance Warmth:</span>
              <span className="font-mono text-white">{voiceParams.resonance.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={1.2}
              step={0.05}
              value={voiceParams.resonance}
              onChange={e => setVoiceParams({ ...voiceParams, resonance: parseFloat(e.target.value) })}
              aria-label="Resonance Warmth"
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

