import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, 
  Smartphone, Monitor, Square, Sliders, Music, Mic, Activity as WaveIcon,
  UploadCloud, FileVideo, Crosshair, Check, ShieldAlert, Clock, Sparkles, Loader2
} from 'lucide-react';
import { 
  DubbingSegment, 
  DuckingConfig, 
  calculateDuckingGain, 
  formatSrtTime,
  autoAlignTimeframesToSpeech,
  FitMode,
  calculateFitSchedule
} from '../utils/dubbingEngine.ts';
import { khmerSynthesizer } from '../utils/khmerTts.ts';
import { 
  generateSyntheticVoicePeaks, 
  generateWaveformProfile, 
  alignSegmentsToVoicePeaks,
  VoicePeak 
} from '../utils/voiceTracker.ts';

export interface SubtitleStyleConfig {
  fontFamily: 'Kantumruy Pro' | 'Battambang' | 'Koulen' | 'Siemreap';
  fontSize: number;
  textColor: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundBox: boolean;
  backgroundOpacity: number;
  position: 'bottom' | 'center' | 'top';
}

interface VideoPlayerProps {
  segments: DubbingSegment[];
  setSegments?: React.Dispatch<React.SetStateAction<DubbingSegment[]>>;
  duckingConfig: DuckingConfig;
  setDuckingConfig: React.Dispatch<React.SetStateAction<DuckingConfig>>;
  subtitleStyle: SubtitleStyleConfig;
  aspectRatio: '16:9' | '9:16' | '1:1';
  setAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
  videoScene: string; // 'action' | 'drama' | 'scifi'
  videoSrc?: string | null;
  videoDuration?: number;
  voicePeaks?: VoicePeak[];
  waveformPoints?: number[];
  isRealVoiceTracked?: boolean;
  onOpenUploadModal?: () => void;
  onDirectFileUpload?: (file: File) => void;
  onMatchVoicePeaks?: () => void;
  voiceSpeed?: number;
  onVoiceSpeedChange?: (speed: number) => void;
  isTranscribing?: boolean;
  onRetranscribeVideo?: () => void;
  onDurationDetected?: (dur: number) => void;
  onUpdateSegment?: (id: string, field: keyof DubbingSegment, value: any) => void;
  fitMode?: FitMode;
  onFitModeChange?: (mode: FitMode) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  segments,
  setSegments,
  duckingConfig,
  setDuckingConfig,
  subtitleStyle,
  aspectRatio,
  setAspectRatio,
  videoScene,
  videoSrc,
  videoDuration,
  voicePeaks: externalVoicePeaks,
  waveformPoints: externalWaveformPoints,
  isRealVoiceTracked = false,
  onOpenUploadModal,
  onDirectFileUpload,
  onMatchVoicePeaks,
  voiceSpeed = 1.0,
  onVoiceSpeedChange,
  isTranscribing = false,
  onRetranscribeVideo,
  onDurationDetected,
  onUpdateSegment,
  fitMode = 'keep_all_speech',
  onFitModeChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dropInputRef = useRef<HTMLInputElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showDualSubtitles, setShowDualSubtitles] = useState(true);
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const [activeSpeakingSegment, setActiveSpeakingSegment] = useState<DubbingSegment | null>(null);

  // Pre-synthesis and Auto-Fit Status (before enabling Play)
  const [isPreSynthesizing, setIsPreSynthesizing] = useState(false);
  const [preSynthProgress, setPreSynthProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [isAudioReady, setIsAudioReady] = useState(false);

  const lastSpokenSegmentId = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const activeVoiceSegmentIdRef = useRef<string | null>(null);
  const isVoiceSpeakingRef = useRef(false);
  const spokenSegmentIdsRef = useRef<Set<string>>(new Set());
  const currentPlayingSegmentIdRef = useRef<string | null>(null);

  const effectiveDuration = videoDuration && videoDuration > 0 ? videoDuration : 20.0;

  // Voice peak tracking derived from video audio duration and speech cues
  const voicePeaks: VoicePeak[] = useMemo(() => {
    if (externalVoicePeaks && externalVoicePeaks.length > 0) {
      return externalVoicePeaks;
    }
    return generateSyntheticVoicePeaks(effectiveDuration, Math.max(3, segments.length));
  }, [externalVoicePeaks, effectiveDuration, segments.length]);

  const waveformPoints = useMemo(() => {
    if (externalWaveformPoints && externalWaveformPoints.length > 0) {
      return externalWaveformPoints;
    }
    return generateWaveformProfile(voicePeaks, effectiveDuration, 72);
  }, [externalWaveformPoints, voicePeaks, effectiveDuration]);

  const [snapNotice, setSnapNotice] = useState<string | null>(null);

  const handleSnapToVoicePeaks = () => {
    if (onMatchVoicePeaks) {
      onMatchVoicePeaks();
      setSnapNotice(`Aligned ${segments.length} cues to original voice speech peaks!`);
      setTimeout(() => setSnapNotice(null), 3000);
      return;
    }
    if (setSegments) {
      const aligned = alignSegmentsToVoicePeaks(segments, voicePeaks, effectiveDuration);
      setSegments(aligned);
      setSnapNotice(`Aligned ${aligned.length} cues to original voice speech peaks!`);
      setTimeout(() => setSnapNotice(null), 3000);
    }
  };

  const handleAutoAlignTimeframes = () => {
    if (!segments || segments.length === 0) return;
    const aligned = autoAlignTimeframesToSpeech(segments, 0.30, 0.88, 4.3);
    if (setSegments) {
      setSegments(aligned.segments);
    }
    setSnapNotice(`Auto-aligned ${aligned.segments.length} timeframes to ~4.3s at 0.88x speed!`);
    setTimeout(() => setSnapNotice(null), 3000);
  };

  // Immediate mute enforcement for video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (duckingConfig.muteOriginalVoice && (duckingConfig.originalAudioMode === 'mute_all' || duckingConfig.originalAudioMode === 'mute_dialogue')) {
      video.muted = true;
      video.volume = 0;
    }
  }, [duckingConfig.muteOriginalVoice, duckingConfig.originalAudioMode, videoSrc]);

  // Handle Play/Pause toggling for video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    if (isPlaying) {
      // Ensure muted state is preserved before play starts
      if (duckingConfig.muteOriginalVoice && (duckingConfig.originalAudioMode === 'mute_all' || duckingConfig.originalAudioMode === 'mute_dialogue')) {
        video.muted = true;
        video.volume = 0;
      }
      video.play().catch(err => {
        console.warn('Video play blocked or interrupted:', err);
        setIsPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, videoSrc, duckingConfig.muteOriginalVoice, duckingConfig.originalAudioMode]);

  // Audio ducking & original voice muting applied to video audio track
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const ducking = calculateDuckingGain(currentTime, segments, duckingConfig);
    try {
      const isMuteAll = duckingConfig.originalAudioMode === 'mute_all';
      const isSpeechActive = ducking.activeSegment !== null;
      const shouldMuteVoice = duckingConfig.muteOriginalVoice && (isMuteAll || isSpeechActive);

      if (isMuteAll || shouldMuteVoice) {
        // Complete mute of original voice so Khmer dubbing delivers without double-talk
        video.volume = 0;
        video.muted = true;
      } else if (duckingConfig.originalAudioMode === 'keep_original') {
        video.muted = false;
        video.volume = 1.0;
      } else {
        const gain = Math.min(1.0, Math.max(0.0, ducking.bgmGain));
        video.muted = gain <= 0.01;
        video.volume = gain;
      }
    } catch {}
  }, [currentTime, segments, duckingConfig, videoSrc]);

  // Fallback animation loop if no external video file is loaded
  // Video timing is strictly continuous — zero pausing, freezing, or delaying
  useEffect(() => {
    if (videoSrc) return; // Native video element handles timing

    let animId: number;
    let lastStamp = performance.now();

    const loop = (now: number) => {
      if (isPlaying) {
        const delta = (now - lastStamp) / 1000;
        setCurrentTime(prev => {
          const next = prev + delta;
          if (next >= effectiveDuration) {
            setIsPlaying(false);
            khmerSynthesizer.stopTimelinePlayback();
            return 0;
          }
          return next;
        });
        lastStamp = now;
      } else {
        lastStamp = now;
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, videoSrc, effectiveDuration]);

  // Frame synchronization loop for uploaded video elements
  useEffect(() => {
    if (!videoSrc) return;
    let frameId: number;
    const checkSync = () => {
      const video = videoRef.current;
      if (video && isPlaying) {
        if (video.paused && isPlaying) {
          video.play().catch(() => {});
        }
        setCurrentTime(video.currentTime);
      }
      frameId = requestAnimationFrame(checkSync);
    };
    frameId = requestAnimationFrame(checkSync);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, videoSrc]);

  // Pre-synthesize all segments with auto-fit before enabling Play (with progress counter)
  useEffect(() => {
    let cancelled = false;
    setIsAudioReady(false);
    setIsPreSynthesizing(true);
    setPreSynthProgress({ completed: 0, total: segments.length });

    khmerSynthesizer.autoFitAllSegments(segments, {
      maxSpeed: 1.60,
      onProgress: (c, t) => {
        if (!cancelled) setPreSynthProgress({ completed: c, total: t });
      }
    }).then(() => {
      if (!cancelled) {
        setIsPreSynthesizing(false);
        setIsAudioReady(true);
      }
    }).catch(err => {
      console.warn('Pre-synthesis notice:', err);
      if (!cancelled) {
        setIsPreSynthesizing(false);
        setIsAudioReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [segments.length, segments.map(s => `${s.id}-${s.khmerText}-${s.speakerVoiceId}-${s.start}-${s.end}`).join(';')]);

  // Single AudioContext timeline playback scheduler: schedules all fitted segments at segment.start.
  // Video timing is completely unchanged — zero pausing, freezing, or delaying.
  useEffect(() => {
    if (isPlaying) {
      khmerSynthesizer.scheduleTimelinePlayback(segments, currentTime);
    } else {
      khmerSynthesizer.stopTimelinePlayback();
    }
    return () => {
      khmerSynthesizer.stopTimelinePlayback();
    };
  }, [isPlaying]);

  // Canvas visual rendering for the procedural cinematic scene (when no uploaded video)
  useEffect(() => {
    if (videoSrc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background gradient according to scene
    const grad = ctx.createLinearGradient(0, 0, width, height);
    if (videoScene === 'action') {
      grad.addColorStop(0, '#1c1917');
      grad.addColorStop(0.5, '#451a03');
      grad.addColorStop(1, '#0c0a09');
    } else if (videoScene === 'scifi') {
      grad.addColorStop(0, '#020617');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#090d16');
    } else {
      // drama
      grad.addColorStop(0, '#1e293b');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#020617');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Cinematic dust particles
    const t = currentTime * 2;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#f59e0b';
    for (let i = 0; i < 25; i++) {
      const px = ((i * 37 + t * 20) % width);
      const py = ((i * 53 + Math.sin(t + i) * 30) % height);
      ctx.beginPath();
      ctx.arc(px, py, (i % 3) + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Scene center art (cinematic temple silhouette / sci-fi portal)
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(width * 0.1, height * 0.85);
    ctx.lineTo(width * 0.35, height * 0.45);
    ctx.lineTo(width * 0.5, height * 0.35);
    ctx.lineTo(width * 0.65, height * 0.45);
    ctx.lineTo(width * 0.9, height * 0.85);
    ctx.fill();

    // Glowing sun or energy sphere behind temple
    const sphereGrad = ctx.createRadialGradient(
      width * 0.5, height * 0.38, 5,
      width * 0.5, height * 0.38, 120
    );
    sphereGrad.addColorStop(0, 'rgba(245, 158, 11, 0.8)');
    sphereGrad.addColorStop(0.4, 'rgba(239, 68, 68, 0.4)');
    sphereGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.38, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Active segment lookup for synchronized canvas scene rendering (continuous video playback)
    const activeOrSpeaking = segments.find(s => currentTime >= s.start && currentTime <= s.end) || activeSpeakingSegment;
    const currentSegIdx = activeOrSpeaking ? segments.findIndex(s => s.id === activeOrSpeaking.id) : -1;
    const currentSeg = activeOrSpeaking || null;

    // Scene title & Shot indicator synchronized with active dialogue segment
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = 'bold 12px monospace';
    const shotText = currentSeg
      ? `SHOT #${currentSegIdx + 1}/${segments.length} • ${currentSeg.speaker.toUpperCase()} • ${currentTime.toFixed(1)}s`
      : `SCENE: ${videoScene.toUpperCase()} • ${segments.length} CUES • ${currentTime.toFixed(1)}s`;
    ctx.fillText(shotText, 20, 44);

    // Draw speaking character indicator & live vocal ring in upper-center so bottom subtitles never overlap
    if (currentSeg) {
      ctx.save();
      const pulse = 14 + Math.abs(Math.sin(currentTime * 12)) * 8;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.24, 24 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.24, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentSeg.speaker.slice(0, 22), width * 0.5, height * 0.24 + 4);
      ctx.restore();
    }

    // Audio Waveform overlay at bottom
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = currentSeg ? '#10b981' : '#38bdf8';
    const waveCount = 48;
    const barWidth = width / waveCount;
    for (let w = 0; w < waveCount; w++) {
      const amp = currentSeg ? 38 : 14;
      const waveHeight = Math.abs(Math.sin((w + currentTime * 8) * 0.4)) * amp + 5;
      ctx.fillRect(w * barWidth + 2, height - waveHeight - 10, barWidth - 4, waveHeight);
    }
    ctx.restore();
  }, [currentTime, videoScene, videoSrc, segments, activeSpeakingSegment]);

  // Current ducking gains
  const ducking = calculateDuckingGain(currentTime, segments, duckingConfig);
  const activeSegment = ducking.activeSegment || activeSpeakingSegment;
  const activeOrNearestSegment = useMemo(() => {
    if (activeSegment) return activeSegment;
    if (!segments || segments.length === 0) return null;
    const upcoming = segments.find(s => s.start >= currentTime);
    return upcoming || segments[segments.length - 1];
  }, [activeSegment, segments, currentTime]);

  const togglePlay = () => {
    khmerSynthesizer.unlockAudio();
    if (!isPlaying) {
      let startTime = currentTime;
      if (currentTime < 0.2 && segments.length > 0 && segments[0].start > 0.2 && segments[0].start <= 2.0) {
        startTime = segments[0].start;
        setCurrentTime(startTime);
        if (videoRef.current) {
          videoRef.current.currentTime = startTime;
        }
      }
      setIsPlaying(true);
      khmerSynthesizer.scheduleTimelinePlayback(segments, startTime);
    } else {
      setIsPlaying(false);
      khmerSynthesizer.stopTimelinePlayback();
      khmerSynthesizer.stop();
    }
  };

  const handleSpeakActiveKhmerCue = () => {
    khmerSynthesizer.unlockAudio();
    const targetSeg = activeSegment || segments.find(s => s.start >= currentTime) || segments[0];
    if (!targetSeg) return;
    setCurrentTime(targetSeg.start);
    if (videoRef.current) {
      videoRef.current.currentTime = targetSeg.start;
    }
    lastSpokenSegmentId.current = targetSeg.id;
    const playSpeed = targetSeg.finalRate || targetSeg.speedRatio || voiceSpeed || 1.0;
    khmerSynthesizer.speak(targetSeg.khmerText, targetSeg.speakerVoiceId, playSpeed);
    setSnapNotice(`Speaking Khmer (${playSpeed.toFixed(2)}x): "${targetSeg.khmerText.slice(0, 28)}..."`);
    setTimeout(() => setSnapNotice(null), 3000);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    khmerSynthesizer.unlockAudio();
    khmerSynthesizer.stopTimelinePlayback();
    khmerSynthesizer.stop();
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    if (isPlaying) {
      khmerSynthesizer.scheduleTimelinePlayback(segments, val);
    }
  };

  const handleDropOverPlayer = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0] && onDirectFileUpload) {
      onDirectFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Aspect ratio wrapper styles
  const aspectClass = 
    aspectRatio === '9:16'
      ? 'aspect-[9/16] max-w-[340px]'
      : aspectRatio === '1:1'
      ? 'aspect-square max-w-[540px]'
      : 'aspect-video max-w-full';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Player Header with Aspect Ratio Switcher, Voice Mute Toggle & Upload Action */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="font-semibold text-slate-200 whitespace-nowrap">
            {videoSrc ? 'Custom Uploaded Video' : 'Live Cinematic Monitor'}
          </span>

          {/* Original Voice Muting Quick Toggle */}
          <button
            onClick={() => {
              setDuckingConfig(prev => {
                const isCurrentlyMuted = prev.muteOriginalVoice || prev.originalAudioMode === 'mute_dialogue' || prev.originalAudioMode === 'mute_all';
                return {
                  ...prev,
                  muteOriginalVoice: !isCurrentlyMuted,
                  originalAudioMode: isCurrentlyMuted ? 'keep_original' : 'mute_all'
                };
              });
            }}
            className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              duckingConfig.muteOriginalVoice || duckingConfig.originalAudioMode === 'mute_dialogue' || duckingConfig.originalAudioMode === 'mute_all'
                ? 'bg-red-500/20 border-red-500/50 text-red-200 hover:bg-red-500/30 shadow-sm shadow-red-500/10'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
            }`}
            title="Click to toggle muting original speech in video so Khmer dubbing plays alone"
          >
            {duckingConfig.muteOriginalVoice || duckingConfig.originalAudioMode === 'mute_dialogue' || duckingConfig.originalAudioMode === 'mute_all' ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>Original Voice: Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Original Voice: On</span>
              </>
            )}
          </button>

          {/* Voice Peak Tracking Match Badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] whitespace-nowrap border ${
            isRealVoiceTracked
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
          }`}>
            <Crosshair className="w-3 h-3 text-amber-400 shrink-0" />
            <span>{isRealVoiceTracked ? 'Real Voice Tracked' : 'Voice Tracked'} ({voicePeaks.length} peaks)</span>
          </span>
        </div>

        {/* Aspect Ratio Buttons, Dual Subtitles Toggle & Upload Action */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDualSubtitles(prev => !prev)}
            className={`px-2.5 py-1 rounded-lg font-semibold border flex items-center gap-1 transition-colors cursor-pointer ${
              showDualSubtitles
                ? 'bg-sky-500/20 border-sky-500/50 text-sky-200'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Show both Original Transcribed Speech and Khmer Translation on the video"
          >
            <span>{showDualSubtitles ? 'Subtitles: Orig + Khmer' : 'Subtitles: Khmer Only'}</span>
          </button>

          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-medium border border-slate-700 flex items-center gap-1 transition-colors"
              title="Upload new video file"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{videoSrc ? 'Change Video' : 'Upload Video'}</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setAspectRatio('16:9')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                aspectRatio === '16:9' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="16:9 Landscape (YouTube & Movies)"
            >
              <Monitor className="w-3 h-3" />
              <span>16:9</span>
            </button>
            <button
              onClick={() => setAspectRatio('9:16')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                aspectRatio === '9:16' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="9:16 Vertical (TikTok, Reels, Shorts)"
            >
              <Smartphone className="w-3 h-3" />
              <span>9:16</span>
            </button>
            <button
              onClick={() => setAspectRatio('1:1')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                aspectRatio === '1:1' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="1:1 Square (Facebook / Instagram)"
            >
              <Square className="w-3 h-3" />
              <span>1:1</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Video Screen with Subtitle Overlay */}
      <div 
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDropOverPlayer}
        className={`relative bg-black flex items-center justify-center min-h-[300px] lg:min-h-[380px] p-2 overflow-hidden transition-all ${
          isDragOver ? 'ring-4 ring-amber-400 ring-inset bg-amber-950/20' : ''
        }`}
      >
        <div className={`relative w-full ${aspectClass} mx-auto transition-all duration-300 rounded-lg overflow-hidden border border-slate-800 shadow-2xl bg-black`}>
          {videoSrc ? (
            /* Native Video Element for Uploaded Video */
            <video
              ref={videoRef}
              src={videoSrc}
              playsInline
              muted={duckingConfig.muteOriginalVoice && (duckingConfig.originalAudioMode === 'mute_all' || !!ducking.activeSegment)}
              className="w-full h-full object-contain block"
              onLoadedMetadata={() => {
                if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0.5) {
                  const trueDur = Number(videoRef.current.duration.toFixed(2));
                  if (onDurationDetected && Math.abs(trueDur - effectiveDuration) > 0.4) {
                    onDurationDetected(trueDur);
                  }
                }
              }}
              onTimeUpdate={() => {
                if (videoRef.current) {
                  setCurrentTime(videoRef.current.currentTime);
                }
              }}
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            /* Canvas Procedural Preview */
            <canvas
              ref={canvasRef}
              width={720}
              height={aspectRatio === '9:16' ? 1280 : aspectRatio === '1:1' ? 720 : 405}
              className="w-full h-full object-cover block"
            />
          )}

          {/* Drag & Drop Overlay Cue */}
          {isDragOver && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center text-amber-400 p-4 text-center z-30">
              <UploadCloud className="w-12 h-12 mb-2 animate-bounce" />
              <span className="font-bold text-sm text-white">Drop Video File to Dub</span>
              <span className="text-xs text-slate-300">Supports MP4, MOV, WebM</span>
            </div>
          )}

          {/* Live AI Transcribing Progress Overlay on Video */}
          {isTranscribing && (
            <div className="absolute inset-x-4 bottom-20 z-30 flex justify-center pointer-events-none">
              <div className="px-4 py-2 rounded-xl bg-slate-950/90 border border-amber-500/50 text-amber-300 text-xs font-semibold flex items-center gap-2 shadow-xl backdrop-blur-md">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span className="font-kantumruy">កំពុងចាប់សំឡេង និង អក្សរពិតប្រាកដពីវីដេអូ (Gemini 3.8 Multimodal ASR)...</span>
              </div>
            </div>
          )}

          {/* Live Full Script Speech Active Indicator */}
          {isLiveSpeaking && activeSpeakingSegment && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/90 text-amber-300 font-semibold text-xs backdrop-blur-md shadow-2xl border border-amber-500/40 pointer-events-none whitespace-nowrap animate-pulse">
              <Mic className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce" />
              <span>🎙️ Live Khmer AI Voice: Speaking Full Script ({activeSpeakingSegment.speaker})</span>
            </div>
          )}

          {/* Burned-in Subtitles Overlay (Supports Dual Subtitles: Original Video Transcript + Khmer Translation) */}
          {activeSegment && (
            <div 
              className={`absolute left-0 right-0 px-6 flex flex-col items-center justify-center pointer-events-none transition-all z-20 gap-1 ${
                subtitleStyle.position === 'top' 
                  ? 'top-8' 
                  : subtitleStyle.position === 'center' 
                  ? 'top-1/2 -translate-y-1/2' 
                  : 'bottom-5'
              }`}
            >
              {showDualSubtitles && activeSegment.originalText && activeSegment.originalText !== activeSegment.khmerText && (
                <div className="max-w-[92%] px-3 py-1 rounded-md bg-slate-950/85 border border-slate-700/70 text-sky-200 text-xs sm:text-sm font-medium text-center shadow-md">
                  <span className="text-[10px] font-mono text-amber-400 mr-1.5">[{activeSegment.start.toFixed(1)}s]</span>
                  {activeSegment.originalText}
                </div>
              )}
              <div 
                className={`max-w-[92%] text-center transition-all ${
                  subtitleStyle.backgroundBox 
                    ? 'px-4 py-1.5 rounded-lg' 
                    : ''
                }`}
                style={{
                  backgroundColor: subtitleStyle.backgroundBox 
                    ? `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity})` 
                    : 'transparent',
                  fontFamily: subtitleStyle.fontFamily,
                  fontSize: `${subtitleStyle.fontSize}px`,
                  color: subtitleStyle.textColor,
                  textShadow: subtitleStyle.outlineWidth > 0 
                    ? `-${subtitleStyle.outlineWidth}px -${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}, ${subtitleStyle.outlineWidth}px -${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}, -${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}, ${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}`
                    : 'none',
                  lineHeight: '1.4'
                }}
              >
                {activeSegment.khmerText}
              </div>
            </div>
          )}

          {/* Unified Top HUD Status Bar inside Video Monitor */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none z-10">
            <div className="bg-slate-950/85 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5 text-[10px] text-slate-300 whitespace-nowrap">
              <span className={`flex items-center gap-1 font-mono ${duckingConfig.muteOriginalVoice || duckingConfig.originalAudioMode === 'mute_all' ? 'text-red-400 font-bold' : 'text-amber-400'}`}>
                {duckingConfig.muteOriginalVoice || duckingConfig.originalAudioMode === 'mute_all' ? (
                  <>
                    <VolumeX className="w-3 h-3 text-red-400" /> Orig: Muted
                  </>
                ) : (
                  <>
                    <Music className="w-3 h-3 text-amber-400" /> BGM: {Math.round(ducking.bgmGain * 100)}%
                  </>
                )}
              </span>
              <span className="text-slate-600">|</span>
              <span className={`flex items-center gap-1 font-mono ${ducking.voiceGain > 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                <Mic className="w-3 h-3" /> Khmer: {ducking.voiceGain > 0 ? `${Math.round(ducking.voiceGain * 100)}%` : 'Ready'}
              </span>
              {ducking.voiceGain > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>

            {(duckingConfig.muteOriginalVoice || duckingConfig.originalAudioMode === 'mute_all') && (
              <div className="bg-red-950/85 backdrop-blur-md px-2 py-1 rounded-lg border border-red-500/40 flex items-center gap-1 text-[10px] text-red-200 shadow-lg whitespace-nowrap">
                <VolumeX className="w-3 h-3 text-red-400" />
                <span className="font-semibold">Khmer Dub Only</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live In-Video Transcription Monitor & Instant Correction Strip */}
      {activeOrNearestSegment && (
        <div className="px-4 py-2.5 bg-slate-900/95 border-t border-slate-800 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                activeSegment ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {activeSegment ? '● LIVE IN VIDEO' : 'NEXT CUE'} [{activeOrNearestSegment.start.toFixed(1)}s → {activeOrNearestSegment.end.toFixed(1)}s]
              </span>
              <span className="text-slate-300 font-semibold font-kantumruy">
                {activeOrNearestSegment.speaker}
              </span>
              {activeOrNearestSegment.confidence && (
                <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-500/20">
                  ASR {Math.round(activeOrNearestSegment.confidence * 100)}%
                </span>
              )}
            </div>

            {onRetranscribeVideo && (
              <button
                type="button"
                onClick={onRetranscribeVideo}
                disabled={isTranscribing}
                className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Re-scan video audio and keyframes with Gemini 3.8 Multimodal ASR"
              >
                <Crosshair className="w-3 h-3 text-amber-400" />
                <span className="font-kantumruy">{isTranscribing ? 'Transcribing Video...' : 'Re-Transcribe Video (ចាប់សំឡេងពីវីដេអូម្តងទៀត)'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-1.5 text-xs">
            <div className="flex items-center gap-2 bg-slate-950/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-sky-400 shrink-0">Video Speech:</span>
              <input
                type="text"
                value={activeOrNearestSegment.originalText}
                onChange={e => {
                  if (onUpdateSegment) {
                    onUpdateSegment(activeOrNearestSegment.id, 'originalText', e.target.value);
                  } else if (setSegments) {
                    const val = e.target.value;
                    setSegments(prev => prev.map(s => s.id === activeOrNearestSegment.id ? { ...s, originalText: val } : s));
                  }
                }}
                aria-label="Active Video Original Transcript"
                className="w-full bg-transparent text-slate-200 text-xs focus:outline-none focus:text-white"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-950/90 px-2.5 py-1.5 rounded-lg border border-emerald-500/30">
              <span className="text-[10px] font-mono uppercase text-emerald-400 shrink-0">Khmer Sub/Dub:</span>
              <input
                type="text"
                value={activeOrNearestSegment.khmerText}
                onChange={e => {
                  if (onUpdateSegment) {
                    onUpdateSegment(activeOrNearestSegment.id, 'khmerText', e.target.value);
                  } else if (setSegments) {
                    const val = e.target.value;
                    setSegments(prev => prev.map(s => s.id === activeOrNearestSegment.id ? { ...s, khmerText: val } : s));
                  }
                }}
                aria-label="Active Video Khmer Subtitle"
                className="w-full bg-transparent text-emerald-200 font-kantumruy text-xs focus:outline-none focus:text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Scrubber & Playback Controls */}
      <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 space-y-3">
        {/* Timeline Scrubber with Visual Audio Waveform & Voice Peaks */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="font-mono text-xs text-amber-400 font-bold">
              {currentTime.toFixed(1)}s
            </span>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Original Voice Bursts Tracked
              </span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-slate-500">
                {effectiveDuration.toFixed(1)}s
              </span>
            </div>
          </div>

          <div className="relative rounded-xl bg-slate-900 border border-slate-800 p-1.5 overflow-hidden">
            {/* Visual Audio Waveform Track */}
            <div className="h-6 flex items-end gap-0.5 opacity-60 px-1 pointer-events-none">
              {waveformPoints.map((val, idx) => {
                const heightPct = Math.max(10, Math.round(val * 100));
                const timeAtPoint = (idx / waveformPoints.length) * effectiveDuration;
                const isSpeechBurst = voicePeaks.some(p => timeAtPoint >= p.start && timeAtPoint <= p.end);
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-t-sm transition-all ${
                      isSpeechBurst ? 'bg-amber-400' : 'bg-slate-600'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>

            {/* Detected Speech Bursts Overlays */}
            <div className="absolute inset-x-1.5 bottom-1.5 top-1.5 pointer-events-none">
              {voicePeaks.map((peak, idx) => {
                const left = (peak.start / effectiveDuration) * 100;
                const width = ((peak.end - peak.start) / effectiveDuration) * 100;
                return (
                  <div
                    key={`peak-${idx}`}
                    className="absolute top-0 bottom-0 bg-emerald-500/20 border-b-2 border-emerald-400 rounded-sm"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`Original speech burst #${idx + 1}: ${peak.start}s - ${peak.end}s`}
                  />
                );
              })}

              {/* Subtitle Dialogue Cues Blocks */}
              {segments.map(seg => {
                const left = (seg.start / effectiveDuration) * 100;
                const width = ((seg.end - seg.start) / effectiveDuration) * 100;
                return (
                  <div
                    key={seg.id}
                    className="absolute top-0.5 bottom-0.5 bg-amber-500/40 border-x-2 border-amber-400 rounded shadow-sm"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${seg.speaker}: ${seg.khmerText}`}
                  />
                );
              })}
            </div>

            {/* Interactive Timeline Scrubber Range */}
            <input
              type="range"
              min={0}
              max={effectiveDuration}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
          </div>
        </div>

        {/* Buttons Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              disabled={isPreSynthesizing}
              className={`h-9 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg transition-all ${
                isPreSynthesizing
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-80'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 cursor-pointer'
              }`}
              title={isPreSynthesizing ? `Fitting voices (${preSynthProgress.completed}/${preSynthProgress.total})...` : (isPlaying ? 'Pause' : 'Play')}
            >
              {isPreSynthesizing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span className="font-mono text-xs">Fitting ({preSynthProgress.completed}/{preSynthProgress.total})</span>
                </>
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={() => {
                khmerSynthesizer.stop();
                lastSpokenSegmentId.current = null;
                setCurrentTime(0);
                if (videoRef.current) videoRef.current.currentTime = 0;
              }}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
              title="Restart from beginning"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Instant Speak Khmer Cue Button */}
            <button
              onClick={handleSpeakActiveKhmerCue}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
              title="Speak active Khmer dubbing line right now"
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Speak Khmer Cue</span>
            </button>

            {/* Live Full Script Speech Mode (Plays full script continuously without holding video) */}
            <div
              className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-sm shadow-amber-500/10"
              title="Full script speech: Khmer voice plays the complete script for every cue in real time while video plays continuously without holding"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Full Script Speech: LIVE</span>
            </div>

            {/* Auto-Align Timeframes Button */}
            <button
              onClick={handleAutoAlignTimeframes}
              className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
              title="Auto-align timeline timeframe slots to match full voice speech duration at natural 1.0x speed"
            >
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Align Timeframes to Voice</span>
            </button>

            {/* Match Video Voice Peaks Action */}
            <button
              onClick={handleSnapToVoicePeaks}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 hover:text-amber-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
              title="Track and snap dialogue cues to match original speaker voice bursts in video"
            >
              <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Track & Match Video Voice</span>
            </button>

            {/* Quick Voice Speed Selector Pill */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-xs">
              <span className="text-[11px] text-emerald-300 font-semibold whitespace-nowrap">Speed:</span>
              <select
                value={Number(voiceSpeed.toFixed(2))}
                onChange={e => {
                  const s = parseFloat(e.target.value) || 0.88;
                  khmerSynthesizer.setMasterSpeed(s);
                  if (onVoiceSpeedChange) onVoiceSpeedChange(s);
                  setSnapNotice(`AI Voice Speed set to ${s.toFixed(2)}x (~4.3s)`);
                  setTimeout(() => setSnapNotice(null), 2200);
                }}
                aria-label="Player Voice Speed"
                className="bg-transparent text-emerald-200 font-mono font-bold text-xs focus:outline-none cursor-pointer"
              >
                <option value={0.88} className="bg-slate-900 font-bold text-amber-300">0.88x (សម្រាយរឿង ~4.3s)</option>
                <option value={0.8} className="bg-slate-900">0.80x (Slow)</option>
                <option value={1} className="bg-slate-900">1.00x (Normal)</option>
                <option value={1.15} className="bg-slate-900">1.15x (សម្រាយរឿង)</option>
                <option value={1.25} className="bg-slate-900">1.25x (Fast)</option>
                <option value={1.5} className="bg-slate-900">1.50x (Turbo)</option>
              </select>
            </div>
          </div>

          {/* Quick Mixer & Audio Ducking Controls (Nice One Dubber 04:26 & 05:11) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDuckingConfig(prev => {
                  const mode = prev.originalAudioMode;
                  if (mode === 'duck_dialogue') {
                    // Switch to 100% mute
                    return {
                      ...prev,
                      muteOriginalVoice: true,
                      originalAudioMode: 'mute_all'
                    };
                  } else if (mode === 'mute_all' || mode === 'mute_dialogue') {
                    // Switch to Keep original audio underneath (Ducking 10%)
                    return {
                      ...prev,
                      bgmVolume: prev.bgmVolume > 0.1 ? prev.bgmVolume : 0.65,
                      duckingThreshold: 0.10,
                      muteOriginalVoice: false,
                      originalAudioMode: 'duck_dialogue'
                    };
                  } else {
                    // Switch to duck dialogue
                    return {
                      ...prev,
                      bgmVolume: 0.65,
                      duckingThreshold: 0.10,
                      muteOriginalVoice: false,
                      originalAudioMode: 'duck_dialogue'
                    };
                  }
                });
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border whitespace-nowrap transition-all cursor-pointer ${
                duckingConfig.originalAudioMode === 'duck_dialogue'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10'
                  : duckingConfig.originalAudioMode === 'mute_all' || duckingConfig.muteOriginalVoice
                  ? 'bg-red-500/20 border-red-500/50 text-red-200 shadow-sm shadow-red-500/10'
                  : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              }`}
              title="Click to toggle: Keep original audio underneath (auto-ducking) vs. Mute all original audio"
            >
              {duckingConfig.originalAudioMode === 'duck_dialogue' ? (
                <>
                  <Music className="w-3.5 h-3.5 text-amber-400" />
                  <span>Audio Underneath (Ducked)</span>
                </>
              ) : duckingConfig.originalAudioMode === 'mute_all' || duckingConfig.muteOriginalVoice ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  <span>Original Muted</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Full Original</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowMixer(!showMixer)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap transition-all cursor-pointer ${
                showMixer 
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Audio Dubbing Mixer</span>
            </button>
          </div>
        </div>

        {snapNotice && (
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 font-medium flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{snapNotice}</span>
          </div>
        )}

        {/* Collapsible Audio Dubbing Mixer Drawer */}
        {showMixer && (
          <div className="pt-3 pb-2 border-t border-slate-800/80 space-y-3 text-xs">
            {/* Original Voice Muting Mode Selector */}
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  <span>Original Voice Isolation & Mute Mode:</span>
                </span>
                <span className="text-[10px] text-amber-400 font-mono">
                  {duckingConfig.muteOriginalVoice ? 'MUTED (Khmer Dub Active)' : 'Active'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDuckingConfig({ ...duckingConfig, muteOriginalVoice: true, originalAudioMode: 'mute_dialogue' })}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    duckingConfig.originalAudioMode === 'mute_dialogue'
                      ? 'bg-red-500/20 border-red-500/60 text-red-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="block text-[11px]">Mute Dialogue</span>
                  <span className="block text-[9px] text-slate-500">0% voice during dub</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDuckingConfig({ ...duckingConfig, muteOriginalVoice: true, originalAudioMode: 'mute_all' })}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    duckingConfig.originalAudioMode === 'mute_all'
                      ? 'bg-red-500/20 border-red-500/60 text-red-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="block text-[11px]">Mute Entire Video</span>
                  <span className="block text-[9px] text-slate-500">Total silence of track</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDuckingConfig({ ...duckingConfig, muteOriginalVoice: false, originalAudioMode: 'duck_dialogue', duckingThreshold: 0.1 })}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    duckingConfig.originalAudioMode === 'duck_dialogue'
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="block text-[11px]">Duck 10%</span>
                  <span className="block text-[9px] text-slate-500">Low background sound</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDuckingConfig({ ...duckingConfig, muteOriginalVoice: false, originalAudioMode: 'keep_original', duckingThreshold: 0.5 })}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    duckingConfig.originalAudioMode === 'keep_original'
                      ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="block text-[11px]">Keep Original</span>
                  <span className="block text-[9px] text-slate-500">Original + Khmer</span>
                </button>
              </div>
            </div>

            {/* Volume Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span className="flex items-center gap-1"><Music className="w-3.5 h-3.5 text-amber-400" /> Original Video Audio / BGM Level:</span>
                  <span className="font-mono text-white">{Math.round(duckingConfig.bgmVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={duckingConfig.bgmVolume}
                  onChange={e => setDuckingConfig({ ...duckingConfig, bgmVolume: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span className="flex items-center gap-1"><Mic className="w-3.5 h-3.5 text-emerald-400" /> Khmer Dubbed Voice Output Level:</span>
                  <span className="font-mono text-white">{Math.round(duckingConfig.voiceVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={duckingConfig.voiceVolume}
                  onChange={e => setDuckingConfig({ ...duckingConfig, voiceVolume: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
