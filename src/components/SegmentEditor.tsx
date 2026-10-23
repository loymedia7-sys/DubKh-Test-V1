import React, { useState, useMemo } from 'react';
import { 
  Volume2, Sparkles, AlertTriangle, CheckCircle, 
  Trash2, Plus, Clock, User, Wand2, ChevronDown, FileText, Loader2, Crosshair, Gauge, Languages, ClipboardPaste, Minus, Zap
} from 'lucide-react';
import { 
  DubbingSegment, 
  TranscriptionMode, 
  SourceLanguage,
  FitMode,
  VOICE_SPEED_PRESETS,
  clampVoiceSpeed,
  calculateEffectiveSpeechDuration,
  applyVoiceSpeedToSegments,
  parseScriptOrSrtToSegments,
  calculateTimeStretch, 
  estimateKhmerDuration,
  calculateAutoFitTiming,
  autoAlignTimeframesToSpeech
} from '../utils/dubbingEngine.ts';
import { KHMER_VOICES, khmerSynthesizer } from '../utils/khmerTts.ts';

interface SegmentEditorProps {
  segments: DubbingSegment[];
  setSegments: React.Dispatch<React.SetStateAction<DubbingSegment[]>>;
  onTranslateLine: (id: string, originalText: string, mode?: TranscriptionMode) => Promise<void>;
  isTranslating: boolean;
  onReTranscribe?: (mode?: TranscriptionMode, sourceLang?: SourceLanguage, speed?: number, customScript?: string) => Promise<void>;
  isTranscribing?: boolean;
  onMatchVoicePeaks?: () => void;
  voiceSpeed?: number;
  onVoiceSpeedChange?: (speed: number) => void;
  transcriptionMode?: TranscriptionMode;
  onTranscriptionModeChange?: (mode: TranscriptionMode) => void;
  sourceLang?: SourceLanguage;
  onSourceLangChange?: (lang: SourceLanguage) => void;
  videoDuration?: number;
  onOpenNiceOneDubberModal?: () => void;
  transcriptionSource?: string;
  transcriptionError?: string | null;
  fitMode?: FitMode;
  onFitModeChange?: (mode: FitMode) => void;
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({
  segments,
  setSegments,
  onTranslateLine,
  isTranslating,
  onReTranscribe,
  isTranscribing,
  onMatchVoicePeaks,
  voiceSpeed = 0.88,
  onVoiceSpeedChange,
  transcriptionMode = 'verbatim',
  onTranscriptionModeChange,
  sourceLang = 'auto',
  onSourceLangChange,
  videoDuration = 30,
  onOpenNiceOneDubberModal,
  transcriptionSource,
  transcriptionError,
  fitMode = 'keep_all_speech',
  onFitModeChange
}) => {
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [filterSpeaker, setFilterSpeaker] = useState<string>('all');
  const [localSpeed, setLocalSpeed] = useState<number>(voiceSpeed || 0.88);
  const [localMode, setLocalMode] = useState<TranscriptionMode>(transcriptionMode);
  const [localLang, setLocalLang] = useState<SourceLanguage>(sourceLang);
  const [isShorteningId, setIsShorteningId] = useState<string | null>(null);
  const [isPreMeasuring, setIsPreMeasuring] = useState<boolean>(false);
  const [maxSpeed, setMaxSpeed] = useState<number>(1.60);
  const [isAutoFitting, setIsAutoFitting] = useState<boolean>(false);
  const [autoFitProgress, setAutoFitProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [showScriptDrawer, setShowScriptDrawer] = useState<boolean>(false);
  const [customScriptText, setCustomScriptText] = useState<string>('');
  const [speedNotice, setSpeedNotice] = useState<string | null>(null);
  const [speedUpToFitLimit, setSpeedUpToFitLimit] = useState<number>(1.10);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Subscribe to per-segment TTS debug status updates (engine, latency, errors)
  React.useEffect(() => {
    return khmerSynthesizer.subscribeDebug(() => {
      setTick(t => t + 1);
    });
  }, []);

  const handleRetrySegmentTts = async (seg: DubbingSegment) => {
    setRetryingId(seg.id);
    try {
      const lineSpeed = clampVoiceSpeed(seg.finalRate || seg.speedRatio || effectiveGlobalSpeed || 1.0);
      const buf = await khmerSynthesizer.getAudioBufferForSegment(seg, lineSpeed, true);
      if (buf) {
        await playSegmentAudio(seg);
      }
    } finally {
      setRetryingId(null);
    }
  };

  const handleTranslateShorten = async (seg: DubbingSegment, targetDuration: number): Promise<string | null> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: seg.originalText || seg.khmerText,
          maxDuration: targetDuration,
          mode: seg.transcriptionMode || effectiveMode,
          targetTone: 'cinematic'
        })
      });
      const data = await res.json();
      return data?.khmerText ? data.khmerText.trim() : null;
    } catch (e) {
      console.error('[Translate Shorten Error]', e);
      return null;
    }
  };

  const handleAutoFitAll = async () => {
    setIsAutoFitting(true);
    setAutoFitProgress({ completed: 0, total: segments.length });
    try {
      const fitted = await khmerSynthesizer.autoFitAllSegments(segments, {
        maxSpeed,
        onTranslateShorten: handleTranslateShorten,
        onProgress: (c, t) => setAutoFitProgress({ completed: c, total: t })
      });
      setSegments([...fitted]);
      setSpeedNotice(`Auto-fitted all ${fitted.length} segments with speed limit ${maxSpeed.toFixed(2)}x!`);
      setTimeout(() => setSpeedNotice(null), 3000);
    } catch (err: any) {
      console.error('Auto-fit failed:', err);
    } finally {
      setIsAutoFitting(false);
    }
  };

  const handleShortenSegmentToFit = async (seg: DubbingSegment) => {
    setIsShorteningId(seg.id);
    try {
      const fitted = await khmerSynthesizer.autoFitSegment(seg, {
        maxSpeed,
        onTranslateShorten: handleTranslateShorten
      });
      setSegments(prev => prev.map(s => s.id === seg.id ? fitted : s));
      setSpeedNotice(`Auto-fitted segment #${seg.id}: ${fitted.finalDuration}s at ${fitted.finalRate}x`);
      setTimeout(() => setSpeedNotice(null), 3000);
    } catch (err: any) {
      console.error('[Shorten Line Error]', err);
    } finally {
      setIsShorteningId(null);
    }
  };

  const handlePreMeasureAll = async () => {
    setIsPreMeasuring(true);
    try {
      const measured = await khmerSynthesizer.preSynthesizeAndMeasureSegments(segments, effectiveGlobalSpeed);
      setSegments([...measured]);
      setSpeedNotice(`Pre-synthesized & measured duration for all ${measured.length} segments!`);
      setTimeout(() => setSpeedNotice(null), 3000);
    } catch (e: any) {
      console.error('Pre-measure failed:', e);
    } finally {
      setIsPreMeasuring(false);
    }
  };

  const autoFitMetrics = useMemo(() => {
    return calculateAutoFitTiming(segments, speedUpToFitLimit);
  }, [segments, speedUpToFitLimit]);

  const effectiveGlobalSpeed = onVoiceSpeedChange ? voiceSpeed : localSpeed;
  const effectiveMode = onTranscriptionModeChange ? transcriptionMode : localMode;
  const effectiveLang = onSourceLangChange ? sourceLang : localLang;

  const speakers = Array.from(new Set(segments.map(s => s.speaker)));

  const handleGlobalSpeedSelect = (newSpeed: number) => {
    const clamped = clampVoiceSpeed(newSpeed);
    setLocalSpeed(clamped);
    if (onVoiceSpeedChange) onVoiceSpeedChange(clamped);
    khmerSynthesizer.setMasterSpeed(clamped);
    setSegments(prev => applyVoiceSpeedToSegments(prev, clamped));
    setSpeedNotice(`Voice Speed set to ${clamped.toFixed(2)}x across all ${segments.length} lines`);
    setTimeout(() => setSpeedNotice(null), 2600);
  };

  const handleSetAllTo088 = () => {
    handleGlobalSpeedSelect(0.88);
    const aligned = autoAlignTimeframesToSpeech(segments, 0.30, 0.88, 4.3);
    setSegments(aligned.segments);
    setSpeedNotice(`✨ Set ALL (Khmer AI Voice Script - Editable) to ~4.3s at 0.88x across all ${aligned.segments.length} lines!`);
    setTimeout(() => setSpeedNotice(null), 3500);
  };

  const handleAutoAlignTimeframesToSpeech = (targetSpeed: number = 0.88) => {
    const aligned = autoAlignTimeframesToSpeech(segments, 0.30, targetSpeed, 4.3);
    setSegments(aligned.segments);
    setSpeedNotice(`⏱️ Timeframes aligned to full speech duration at ${targetSpeed.toFixed(2)}x (~4.3s) across all ${aligned.segments.length} lines!`);
    setTimeout(() => setSpeedNotice(null), 3500);
  };

  const handleAutoSyncSpeedToSlots = (customLimit?: number) => {
    const limit = customLimit || speedUpToFitLimit || 1.10;
    const metrics = calculateAutoFitTiming(segments, limit);
    setSegments(metrics.segments);
    setSpeedNotice(`⚡ Auto-Fit applied: calibrated ${metrics.rushedLinesCount} lines (max ${limit.toFixed(2)}x) to fit slots without excessive rushing!`);
    setTimeout(() => setSpeedNotice(null), 3200);
  };

  const handleLineSpeedChange = (id: string, newSpeed: number) => {
    const clamped = clampVoiceSpeed(newSpeed);
    setSegments(prev => prev.map(seg => seg.id === id ? { ...seg, speedRatio: clamped } : seg));
  };

  const handleModeSelect = async (newMode: TranscriptionMode) => {
    setLocalMode(newMode);
    if (onTranscriptionModeChange) onTranscriptionModeChange(newMode);
    if (onReTranscribe) {
      await onReTranscribe(newMode, effectiveLang, effectiveGlobalSpeed);
    }
  };

  const handleLangSelect = (newLang: SourceLanguage) => {
    setLocalLang(newLang);
    if (onSourceLangChange) onSourceLangChange(newLang);
  };

  const handleImportScript = async () => {
    if (!customScriptText.trim()) return;
    if (onReTranscribe) {
      await onReTranscribe(effectiveMode, effectiveLang, effectiveGlobalSpeed, customScriptText);
    } else {
      const parsed = parseScriptOrSrtToSegments(
        customScriptText,
        videoDuration,
        segments[0]?.speakerVoiceId || 'piseth',
        effectiveGlobalSpeed
      );
      if (parsed.length > 0) setSegments(parsed);
    }
    setShowScriptDrawer(false);
  };

  const handleUpdateText = (id: string, newKhmer: string) => {
    setSegments(prev => prev.map(seg => {
      if (seg.id === id) {
        const estDuration = estimateKhmerDuration(newKhmer);
        return {
          ...seg,
          khmerText: newKhmer,
          naturalDuration: estDuration
        };
      }
      return seg;
    }));
  };

  const handleUpdateOriginalText = (id: string, newOriginal: string) => {
    setSegments(prev => prev.map(seg => seg.id === id ? { ...seg, originalText: newOriginal } : seg));
  };

  const handleVoiceChange = (id: string, newVoiceId: string) => {
    setSegments(prev => prev.map(seg => seg.id === id ? { ...seg, speakerVoiceId: newVoiceId } : seg));
  };

  const handleTimeChange = (id: string, field: 'start' | 'end', val: number) => {
    setSegments(prev => prev.map(seg => {
      if (seg.id === id) {
        const updated = { ...seg, [field]: val };
        const est = estimateKhmerDuration(updated.khmerText);
        return {
          ...updated,
          naturalDuration: est
        };
      }
      return seg;
    }));
  };

  const [isPlayingFullMovie, setIsPlayingFullMovie] = useState(false);

  const playSegmentAudio = async (seg: DubbingSegment) => {
    setIsPlayingFullMovie(false);
    khmerSynthesizer.unlockAudio();
    setActivePlayingId(seg.id);
    const segSpeed = clampVoiceSpeed(seg.speedRatio || effectiveGlobalSpeed || 1.0);
    const playDur = calculateEffectiveSpeechDuration(seg.khmerText, segSpeed, 1.0);
    await khmerSynthesizer.speak(seg.khmerText, seg.speakerVoiceId, segSpeed);
    setTimeout(() => {
      setActivePlayingId(prev => (prev === seg.id ? null : prev));
    }, playDur * 1000);
  };

  const handleTogglePlayFullMovie = async () => {
    if (isPlayingFullMovie) {
      khmerSynthesizer.stop();
      setIsPlayingFullMovie(false);
      setActivePlayingId(null);
      return;
    }
    setIsPlayingFullMovie(true);
    await khmerSynthesizer.speakFullMovieSequence(segments, id => {
      setActivePlayingId(id);
    });
    setIsPlayingFullMovie(false);
    setActivePlayingId(null);
  };

  const handleAddSegment = () => {
    const last = segments[segments.length - 1];
    const newStart = last ? Number((last.end + 0.5).toFixed(1)) : 1.0;
    const newEnd = Number((newStart + 3.0).toFixed(1));
    const newSeg: DubbingSegment = {
      id: `seg-${Date.now().toString().slice(-4)}`,
      start: newStart,
      end: newEnd,
      speaker: effectiveMode === 'recap' ? 'AI Narrator (សម្រាយរឿង)' : 'Speaker 1',
      speakerVoiceId: segments[0]?.speakerVoiceId || 'piseth',
      originalText: 'In this scene, the hero discovers the hidden truth.',
      khmerText: 'នៅក្នុងឈុតឆាកនេះ តួឯករបស់យើងក៏បានរកឃើញការពិតដែលលាក់ទុក។',
      speedRatio: effectiveGlobalSpeed,
      naturalDuration: 2.8,
      confidence: 0.99,
      transcriptionMode: effectiveMode
    };
    setSegments([...segments, newSeg]);
  };

  const handleDeleteSegment = (id: string) => {
    if (segments.length <= 1) return;
    setSegments(segments.filter(s => s.id !== id));
  };

  const filtered = filterSpeaker === 'all' 
    ? segments 
    : segments.filter(s => s.speaker === filterSpeaker);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-6 shadow-xl space-y-4">
      {/* Editor Header */}
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span className="text-amber-400 font-kantumruy">កែសម្រួលអត្ថបទ និង ល្បឿនសំឡេង AI</span>
                <span className="text-slate-400 font-normal">| Smart Transcribe & Voice Speed</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 font-mono font-bold whitespace-nowrap">
                {segments.length} lines
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300 font-mono font-bold whitespace-nowrap">
                Speed: {effectiveGlobalSpeed.toFixed(2)}x
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Smart full-movie transcription (បកប្រែចំៗ / តួអង្គ / សម្រាយរឿង) with pitch-preserved AI voice speed control (0.5x – 2.0x).
            </p>
          </div>
        </div>

        {/* 1. VOICE SPEED STUDIO BAR (ល្បឿនសំឡេង AI) */}
        <div className="p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-emerald-300 font-kantumruy">
                ល្បឿនសំឡេង AI (Voice Speed Control):
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-mono text-xs font-bold">
                {effectiveGlobalSpeed.toFixed(2)}x
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                • Pitch-Preserved (មិនបែកសំឡេង)
              </span>
            </div>

            {/* Fine Speed Slider + Stepper */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleGlobalSpeedSelect(effectiveGlobalSpeed - 0.05)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                title="Decrease voice speed by 0.05x"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={effectiveGlobalSpeed}
                onChange={e => handleGlobalSpeedSelect(parseFloat(e.target.value))}
                aria-label="Global Voice Speed"
                className="w-28 sm:w-36 accent-emerald-400 cursor-pointer"
              />
              <button
                onClick={() => handleGlobalSpeedSelect(effectiveGlobalSpeed + 0.05)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                title="Increase voice speed by 0.05x"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 1-Click Voice Speed Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {VOICE_SPEED_PRESETS.map(preset => {
              const isSelected = Math.abs(effectiveGlobalSpeed - preset.value) < 0.03;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleGlobalSpeedSelect(preset.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  <span className="font-kantumruy">{preset.kmLabel}</span>
                  {preset.badge && (
                    <span className={`px-1 py-0.2 rounded text-[9px] uppercase ${
                      isSelected ? 'bg-slate-950 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {preset.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Nice One Dubber Dynamic Speed-Up ("Auto-Fit") Control Panel (02:31 & 04:01) */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1 font-kantumruy">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Speed up to fit (Auto-Fit Lip Sync):</span>
              </span>
              <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                <input
                  type="range"
                  min={1.0}
                  max={2.0}
                  step={0.05}
                  value={speedUpToFitLimit}
                  onChange={e => setSpeedUpToFitLimit(parseFloat(e.target.value))}
                  aria-label="Speed up to fit limit"
                  className="w-20 sm:w-24 accent-amber-400 cursor-pointer"
                />
                <span className="font-mono text-[11px] font-bold text-amber-300">
                  {speedUpToFitLimit.toFixed(2)}x
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1 ${
                autoFitMetrics.rushedLinesCount > 0
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              }`}>
                Auto-fit: {autoFitMetrics.rushedLinesCount} rushed lines
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSetAllTo088}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-md shadow-emerald-500/25 transition-all cursor-pointer flex items-center gap-1.5"
                title="Apply 0.88x (~4.3s) to all lines and auto-align timeframes"
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>Set ALL to 0.88x (~4.3s)</span>
              </button>

              <button
                onClick={() => handleAutoAlignTimeframesToSpeech(0.88)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white shadow-md shadow-sky-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                title="Align timeframe slots to match full speech duration at 0.88x speed with zero rushing"
              >
                <Clock className="w-3.5 h-3.5 text-sky-200 fill-transparent" />
                <span>Auto-Align Timeframes</span>
              </button>

              <button
                onClick={() => handleAutoSyncSpeedToSlots(speedUpToFitLimit)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1"
                title="Moderate calibration up to set limit"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Fit Slots ({speedUpToFitLimit.toFixed(2)}x)</span>
              </button>

              {onOpenNiceOneDubberModal && (
                <button
                  onClick={onOpenNiceOneDubberModal}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 cursor-pointer flex items-center gap-1"
                  title="View Nice One Dubber AI pipeline and Microsoft neural voice tuning formulas"
                >
                  <span>Pipeline Specs</span>
                </button>
              )}
            </div>
          </div>

          {speedNotice && (
            <div className="text-[11px] text-emerald-300 font-medium flex items-center gap-1.5 pt-0.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{speedNotice}</span>
            </div>
          )}
        </div>

        {/* Auto-Fit Lip Sync & Slot Timing Control Bar */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5 font-mono">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Voice Auto-Fit:</span>
            </span>

            {/* Max Speed Slider (1.2x to 2.0x, default 1.6x) */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-300 font-medium">Max Speed:</span>
              <input
                type="range"
                min={1.20}
                max={2.00}
                step={0.05}
                value={maxSpeed}
                onChange={e => setMaxSpeed(parseFloat(e.target.value))}
                aria-label="Max speed limit"
                className="w-24 sm:w-32 accent-amber-400 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-amber-300 min-w-[54px]">
                {maxSpeed.toFixed(2)}x (+{Math.round((maxSpeed - 1.0) * 100)}%)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoFitAll}
              disabled={isAutoFitting}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
              title="Automatically calculate speed and fit all segments inside their slot before segment.end"
            >
              {isAutoFitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Auto-Fitting ({autoFitProgress.completed}/{autoFitProgress.total})...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                  <span>Auto-fit all segments</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePreMeasureAll}
              disabled={isPreMeasuring}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Pre-synthesize & measure exact TTS duration for every line"
            >
              {isPreMeasuring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{isPreMeasuring ? 'Measuring All...' : 'Measure Durations'}</span>
            </button>
          </div>
        </div>

        {/* 2. BETTER TRANSCRIPTION ENGINE TOOLBAR (របៀបបកប្រែ និង សម្រាយរឿង) */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Transcription Mode Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-semibold mr-1 font-kantumruy">
                របៀបបកប្រែ (Mode):
              </span>
              <button
                onClick={() => handleModeSelect('verbatim')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer font-kantumruy ${
                  effectiveMode === 'verbatim'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
                title="Exact speech & subtitle transcription directly from the video"
              >
                📝 បកប្រែចំៗ (Exact Video Speech)
              </button>
              <button
                onClick={() => handleModeSelect('character')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer font-kantumruy ${
                  effectiveMode === 'character'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                🎭 សន្ទនាតួអង្គ (Character Dub)
              </button>
              <button
                onClick={() => handleModeSelect('recap')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer font-kantumruy ${
                  effectiveMode === 'recap'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                🎬 សម្រាយរឿង AI (Movie Recap)
              </button>
            </div>

            {/* Source Language & Paste SRT Button */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
                <Languages className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <select
                  value={effectiveLang}
                  onChange={e => handleLangSelect(e.target.value as SourceLanguage)}
                  aria-label="Source Language"
                  className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="auto" className="bg-slate-900">Auto-Detect Language</option>
                  <option value="en" className="bg-slate-900">English Movie</option>
                  <option value="zh" className="bg-slate-900">Chinese (中文 / រឿងចិន)</option>
                  <option value="ko" className="bg-slate-900">Korean (한국어 / រឿងកូរ៉េ)</option>
                  <option value="th" className="bg-slate-900">Thai (ไทย / រឿងថៃ)</option>
                  <option value="km" className="bg-slate-900">Khmer (ភាសាខ្មែរ)</option>
                </select>
              </div>

              <button
                onClick={() => setShowScriptDrawer(prev => !prev)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showScriptDrawer
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
                title="Paste custom SRT subtitles or movie script lines to auto-segment and translate"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-amber-400" />
                <span>Paste Script / SRT</span>
              </button>
            </div>
          </div>

          {/* Collapsible Paste Script / SRT Importer */}
          {showScriptDrawer && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium font-kantumruy">
                  បញ្ចូលអត្ថបទរឿង ឬ Subtitle (.SRT / អត្ថបទធម្មតា) ដើម្បីបំបែកជាសំឡេង AI ស្វ័យប្រវត្តិ៖
                </span>
                <button
                  onClick={() => setCustomScriptText(
                    `1\n00:00:01,000 --> 00:00:04,500\nនៅក្នុងឈុតឆាកបើកឆាកនេះ តួឯកប្រុសបានរកឃើញផែនទីសម្ងាត់នៅក្នុងប្រាសាទបុរាណ។\n\n2\n00:00:05,000 --> 00:00:08,800\nភ្លាមៗនោះ ក្រុមសត្រូវក៏បានសម្រុកចូលមកឡោមព័ទ្ធពីគ្រប់ទិសទី។\n\n3\n00:00:09,200 --> 00:00:13,000\nដោយមិនបង្អង់ពេល គាត់ក៏បានប្រើក្បាច់គុនពិសេសដើម្បីទម្លុះផ្លូវចេញដោយជោគជ័យ។`
                  )}
                  className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                >
                  Load Sample Recap SRT
                </button>
              </div>
              <textarea
                rows={3}
                value={customScriptText}
                onChange={e => setCustomScriptText(e.target.value)}
                placeholder="Paste .SRT timestamps or multi-line movie script here..."
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 font-kantumruy focus:outline-none focus:border-amber-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowScriptDrawer(false)}
                  className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportScript}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Import & Sync to Timeline
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls: Transcribe Full Movie, Play Full Movie AI & Add Line */}
        <div className="flex flex-wrap items-center gap-2">
          {onReTranscribe && (
            <button
              onClick={() => onReTranscribe(effectiveMode, effectiveLang, effectiveGlobalSpeed)}
              disabled={isTranscribing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-md ${
                isTranscribing
                  ? 'bg-amber-500/50 text-slate-950 cursor-wait'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20 cursor-pointer'
              }`}
              title="Automatically transcribe the FULL movie from beginning to end in the selected style"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Transcribing Full Movie...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Transcribe Full Movie</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleTogglePlayFullMovie}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all cursor-pointer ${
              isPlayingFullMovie
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
            }`}
            title="Play all movie lines sequentially using Normal Cambodia AI voice at your chosen speed"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isPlayingFullMovie ? 'Stop Full Movie AI' : `Play Full Movie AI (${effectiveGlobalSpeed.toFixed(2)}x)`}</span>
          </button>

          {onMatchVoicePeaks && (
            <button
              onClick={onMatchVoicePeaks}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700 whitespace-nowrap transition-colors cursor-pointer"
              title="Match and snap speech cues to detected voice energy bursts across the full video"
            >
              <Crosshair className="w-3.5 h-3.5 text-amber-400" />
              <span>Track Video Voice</span>
            </button>
          )}

          <button
            onClick={handleSetAllTo088}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 whitespace-nowrap transition-colors cursor-pointer"
            title="Set all (Khmer AI Voice Script - Editable) lines to ~4.3s at 0.88x speed"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            <span>Set ALL to 0.88x (~4.3s)</span>
          </button>

          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterSpeaker}
              onChange={e => setFilterSpeaker(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 appearance-none pr-8 cursor-pointer w-full"
            >
              <option value="all">All Characters ({segments.length})</option>
              {speakers.map(spk => (
                <option key={spk} value={spk}>{spk}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={handleAddSegment}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Line</span>
          </button>
        </div>

        {/* ASR Source Badge and Transcription Error Status */}
        {transcriptionSource && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-400">ASR Source:</span>
            <span className="font-mono font-semibold text-amber-300">{transcriptionSource}</span>
          </div>
        )}

        {transcriptionError && (
          <div className="w-full flex items-center justify-between p-2.5 rounded-xl bg-red-950/40 border border-red-500/50 text-xs text-red-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{transcriptionError}</span>
            </div>
            {onReTranscribe && (
              <button
                onClick={() => onReTranscribe(effectiveMode, effectiveLang, effectiveGlobalSpeed)}
                className="px-2.5 py-1 rounded-lg bg-red-800 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Segments List */}
      <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
        {filtered.map((seg, idx) => {
          const debugInfo = khmerSynthesizer.getDebugInfo(seg.id);
          const slotDuration = Number((seg.end - seg.start).toFixed(2));
          const lineSpeed = clampVoiceSpeed(seg.speedRatio || effectiveGlobalSpeed || 1.0);
          const effectiveSpokenDuration = calculateEffectiveSpeechDuration(
            seg.khmerText, 
            lineSpeed, 
            1.0, 
            seg.naturalDuration
          );
          const measuredTtsDur = Number((seg.ttsDuration || effectiveSpokenDuration).toFixed(2));
          const isTtsLongerThanSlot = measuredTtsDur > slotDuration;
          const overrunAmount = Number((measuredTtsDur - slotDuration).toFixed(2));
          const timing = calculateTimeStretch(slotDuration, effectiveSpokenDuration);
          const activeVoice = KHMER_VOICES.find(v => v.id === seg.speakerVoiceId) || KHMER_VOICES[0];
          const isPlayingThis = activePlayingId === seg.id;
          const asrConfidence = Math.round((seg.confidence || 0.97) * 100);

          return (
            <div 
              key={seg.id}
              className={`p-3.5 rounded-xl border transition-all ${
                isTtsLongerThanSlot
                  ? 'bg-red-950/20 border-red-800/60 shadow-lg shadow-red-950/20'
                  : timing.isOverflow
                  ? 'bg-amber-950/15 border-amber-800/40'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Line Metadata Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-xs">
                {/* Speaker & Voice Selector */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-slate-500 font-bold text-[11px]">#{idx + 1}</span>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                    <User className="w-3 h-3 text-amber-400" />
                    <span className="font-semibold">{seg.speaker}</span>
                  </div>

                  {/* Voice Selector for this segment */}
                  <select
                    value={seg.speakerVoiceId}
                    onChange={e => handleVoiceChange(seg.id, e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-md px-2 py-0.5 text-xs text-amber-300 font-medium focus:outline-none"
                  >
                    {KHMER_VOICES.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.gender})
                      </option>
                    ))}
                  </select>

                  {/* ASR Confidence Badge */}
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-emerald-400">
                    {asrConfidence}% ASR
                  </span>
                </div>

                {/* Timing controls, Per-Line Voice Speed Stepper & Fit Badge */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Per-Line Voice Speed Control */}
                  <div className="flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/30 font-mono text-[11px] text-emerald-300">
                    <Gauge className="w-3 h-3 text-emerald-400" />
                    <button
                      onClick={() => handleLineSpeedChange(seg.id, lineSpeed - 0.05)}
                      className="px-1 hover:text-white cursor-pointer font-bold"
                      title="Slow down this line by 0.05x"
                    >
                      -
                    </button>
                    <span className="font-bold min-w-[38px] text-center">{lineSpeed.toFixed(2)}x</span>
                    <button
                      onClick={() => handleLineSpeedChange(seg.id, lineSpeed + 0.05)}
                      className="px-1 hover:text-white cursor-pointer font-bold"
                      title="Speed up this line by 0.05x"
                    >
                      +
                    </button>
                  </div>

                  {/* Slot Duration */}
                  <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800 font-mono text-[11px] text-slate-400">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <input
                      type="number"
                      step={0.1}
                      value={seg.start}
                      onChange={e => handleTimeChange(seg.id, 'start', parseFloat(e.target.value) || 0)}
                      className="w-11 bg-transparent text-white text-center focus:outline-none"
                    />
                    <span>-</span>
                    <input
                      type="number"
                      step={0.1}
                      value={seg.end}
                      onChange={e => handleTimeChange(seg.id, 'end', parseFloat(e.target.value) || 0)}
                      className="w-11 bg-transparent text-white text-center focus:outline-none"
                    />
                    <span className="text-slate-300 font-bold">Slot: {slotDuration}s</span>
                  </div>

                  {/* Real Measured TTS Duration */}
                  <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800 font-mono text-[11px] text-amber-300">
                    <Volume2 className="w-3 h-3 text-amber-400" />
                    <span>TTS: {seg.ttsDuration ? `${seg.ttsDuration.toFixed(2)}s` : `${effectiveSpokenDuration.toFixed(2)}s (est)`}</span>
                  </div>

                  {/* Red warning badge if TTS is longer than the slot + Shorten button */}
                  {isTtsLongerThanSlot ? (
                    <div className="flex items-center gap-1.5">
                      <div className="px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/50 shadow-sm shadow-red-500/20">
                        <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                        <span>TTS Exceeds Slot (+{overrunAmount.toFixed(1)}s)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleShortenSegmentToFit(seg)}
                        disabled={isShorteningId === seg.id}
                        className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 flex items-center gap-1 transition-all shadow-sm shadow-amber-500/20 cursor-pointer"
                        title="Call /api/translate to shorten this Khmer line so it fits within the slot duration"
                      >
                        {isShorteningId === seg.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3 fill-current" />
                        )}
                        <span>Shorten text to fit</span>
                      </button>
                    </div>
                  ) : (
                    <div className="px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      <span>Fits Slot ({effectiveSpokenDuration}s)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Source Original Text vs Khmer Text Editor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1 flex items-center justify-between">
                    <span>Transcribed Source Line (Editable)</span>
                    <button
                      onClick={() => onTranslateLine(seg.id, seg.originalText, effectiveMode)}
                      disabled={isTranslating}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                      title="Translate or adapt this source line to Cambodian Khmer"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>AI Translate → Khmer</span>
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={seg.originalText}
                    onChange={e => handleUpdateOriginalText(seg.id, e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-sans leading-relaxed focus:outline-none focus:border-slate-600"
                    placeholder="Source movie speech or subtitle..."
                  />
                </div>

                <div>
                  <div className="text-[10px] text-amber-400 uppercase font-semibold mb-1 flex items-center justify-between font-kantumruy">
                    <span className="flex items-center gap-1.5">
                      <span>ភាសាខ្មែរ (Khmer AI Voice Script - Editable)</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleLineSpeedChange(seg.id, 0.88);
                          setSegments(prev => prev.map(s => s.id === seg.id ? {
                            ...s,
                            speedRatio: 0.88,
                            naturalDuration: 3.78,
                            end: Number((s.start + 4.3).toFixed(2))
                          } : s));
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                          Math.abs(lineSpeed - 0.88) < 0.02
                            ? 'bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title="Set this line to 0.88x (~4.3s)"
                      >
                        0.88x (~4.3s)
                      </button>
                      <button
                        type="button"
                        onClick={handleSetAllTo088}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold"
                        title="Set ALL (Khmer AI Voice Script - Editable) lines to ~4.3s at 0.88x"
                      >
                        Set ALL
                      </button>
                      <span className="text-emerald-400 font-mono font-normal">
                        ~{effectiveSpokenDuration.toFixed(1)}s at {lineSpeed.toFixed(2)}x
                      </span>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={seg.khmerText}
                    onChange={e => handleUpdateText(seg.id, e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-900/90 border border-slate-700 text-sm text-amber-200 font-kantumruy leading-relaxed focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors"
                    placeholder="វាយអត្ថបទជាភាសាខ្មែរនៅទីនេះ..."
                  />
                </div>
              </div>

              {/* Action Toolbar for this line */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-850 text-xs">
                <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                  <span className="text-slate-500 font-kantumruy">
                    សំឡេង: {activeVoice.nameKhmer} • ល្បឿន {lineSpeed.toFixed(2)}x
                  </span>
                  {debugInfo && (
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      {debugInfo.failed ? (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-950/70 border border-red-500/40 text-red-300">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          <span>TTS Failed ({debugInfo.error || '503'})</span>
                          <button
                            type="button"
                            onClick={() => handleRetrySegmentTts(seg)}
                            disabled={retryingId === seg.id}
                            className="ml-1 px-1.5 py-0.2 rounded bg-red-800 hover:bg-red-700 text-white font-bold cursor-pointer transition-colors"
                          >
                            {retryingId === seg.id ? 'Retrying...' : 'Retry'}
                          </button>
                        </span>
                      ) : debugInfo.isFallback ? (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300" title="Fallback voice engine was used">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>Fallback: {debugInfo.engine.replace('Microsoft-Edge-Neural', 'Edge')} ({debugInfo.latencyMs}ms)</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400" title="Synthesized via Microsoft Azure Neural">
                          <Zap className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{debugInfo.engine.startsWith('Microsoft') ? 'Edge Neural' : debugInfo.engine} ({debugInfo.latencyMs}ms)</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onTranslateLine(seg.id, seg.originalText, 'recap')}
                    disabled={isTranslating}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-medium border border-amber-500/30 flex items-center gap-1 transition-colors cursor-pointer font-kantumruy"
                    title="Adapt this line into Cambodian AI Movie Recap style (សម្រាយរឿង)"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>កែជាសម្រាយរឿង</span>
                  </button>

                  <button
                    onClick={() => playSegmentAudio(seg)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                      isPlayingThis
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{isPlayingThis ? `Speaking (${lineSpeed.toFixed(2)}x)...` : `Preview (${lineSpeed.toFixed(2)}x)`}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteSegment(seg.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete segment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

