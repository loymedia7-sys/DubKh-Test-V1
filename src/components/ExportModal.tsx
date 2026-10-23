import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, Film, FileText, Music, CheckCircle2, 
  Loader2, Sparkles, Monitor, Smartphone, X, Play, Pause, AlertCircle, Terminal, Copy, Check
} from 'lucide-react';
import { DubbingSegment, DuckingConfig, generateSrt, generateVtt, FitMode, calculateFitSchedule, generateFfmpegDubbingCommand } from '../utils/dubbingEngine.ts';
import { SubtitleStyleConfig } from './VideoPlayer.tsx';
import { khmerSynthesizer } from '../utils/khmerTts.ts';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  segments: DubbingSegment[];
  aspectRatio: '16:9' | '9:16' | '1:1';
  projectTitle: string;
  subtitleStyle: SubtitleStyleConfig;
  videoDuration?: number;
  videoSrc?: string | null;
  sceneType?: string;
  duckingConfig?: DuckingConfig;
  voiceSpeed?: number;
  fitMode?: FitMode;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  segments,
  aspectRatio,
  projectTitle,
  subtitleStyle,
  videoDuration = 20.0,
  videoSrc = null,
  sceneType = 'action',
  duckingConfig = {
    bgmVolume: 0.65,
    voiceVolume: 1.0,
    duckingThreshold: 0.1,
    attackTime: 0.1,
    releaseTime: 0.25,
    muteOriginalVoice: false,
    originalAudioMode: 'duck_dialogue'
  },
  voiceSpeed = 1.0,
  fitMode = 'keep_all_speech'
}) => {
  const [exportFormat, setExportFormat] = useState<'burned_mp4' | 'clean_mp4' | 'audio_only' | 'srt_only' | 'ffmpeg_cmd'>('burned_mp4');
  const [resolution, setResolution] = useState<'1080p' | '720p'>('720p');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [downloadMime, setDownloadMime] = useState<string>('');
  const [exportedFileSize, setExportedFileSize] = useState<string>('');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [copiedFfmpeg, setCopiedFfmpeg] = useState(false);

  const abortExportRef = useRef<boolean>(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      abortExportRef.current = true;
    };
  }, [downloadUrl]);

  if (!isOpen) return null;

  const sanitizedTitle = (projectTitle || 'khmer_dubbed_movie')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');

  const handleDownloadSrt = () => {
    const srtContent = generateSrt(segments);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizedTitle}_khmer.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadVtt = () => {
    const vttContent = generateVtt(segments);
    const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizedTitle}_khmer.vtt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStartRender = async () => {
    abortExportRef.current = false;
    setIsExporting(true);
    setExportProgress(5);
    setDownloadUrl(null);

    try {
      // 1. Export Master Mixed WAV Audio
      if (exportFormat === 'audio_only') {
        setExportStatusText('Synthesizing & time-aligning all Khmer speech lines...');
        const wavBuffer = await khmerSynthesizer.renderFullMovieAudioWav(
          segments,
          videoDuration,
          pct => {
            setExportProgress(Math.min(95, Math.max(10, pct)));
          }
        );

        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const filename = `${sanitizedTitle}_master_khmer_dub.wav`;
        
        setDownloadUrl(url);
        setDownloadFilename(filename);
        setDownloadMime('audio/wav');
        setExportedFileSize(`${(blob.size / (1024 * 1024)).toFixed(2)} MB`);
        setExportProgress(100);
        setExportStatusText('Complete! Audio master ready to download.');
        setIsExporting(false);

        // Auto trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 2. Export Timed Subtitles only
      if (exportFormat === 'srt_only') {
        handleDownloadSrt();
        setIsExporting(false);
        return;
      }

      // 3. Export Video (burned_mp4 or clean_mp4)
      setExportStatusText('Preloading Khmer neural speech for all timeframe slots...');
      setExportProgress(15);
      await khmerSynthesizer.preloadSegments(segments, voiceSpeed);

      if (abortExportRef.current) return;

      setExportStatusText('Configuring canvas video encoder and audio mixer...');
      setExportProgress(25);

      // Resolution dimensions
      const is720 = resolution === '720p';
      let width = 1280;
      let height = 720;
      if (aspectRatio === '9:16') {
        width = is720 ? 720 : 1080;
        height = is720 ? 1280 : 1920;
      } else if (aspectRatio === '1:1') {
        width = is720 ? 720 : 1080;
        height = is720 ? 720 : 1080;
      } else {
        width = is720 ? 1280 : 1920;
        height = is720 ? 720 : 1080;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize 2D rendering context');

      // Setup Web Audio graph for real-time muxing
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const dest = audioCtx.createMediaStreamDestination();

      // Video Source Element if user uploaded a video
      let videoEl: HTMLVideoElement | null = null;
      let videoSourceNode: MediaElementAudioSourceNode | null = null;

      if (videoSrc) {
        videoEl = document.createElement('video');
        videoEl.src = videoSrc;
        videoEl.crossOrigin = 'anonymous';
        videoEl.muted = false;
        videoEl.playsInline = true;
        await new Promise<void>((resolve, reject) => {
          if (!videoEl) return resolve();
          videoEl.onloadedmetadata = () => resolve();
          videoEl.onerror = () => resolve(); // continue even if video tag fallback
        });

        try {
          videoSourceNode = audioCtx.createMediaElementSource(videoEl);
          const bgmGain = audioCtx.createGain();
          const targetVol = duckingConfig.muteOriginalVoice || duckingConfig.originalAudioMode === 'mute_all'
            ? 0.0
            : Math.max(0.0, duckingConfig.bgmVolume);
          bgmGain.gain.setValueAtTime(targetVol, audioCtx.currentTime);
          videoSourceNode.connect(bgmGain);
          bgmGain.connect(dest);
        } catch {
          // MediaElementAudioSource already connected or cross-origin restriction
        }
      }

      // Pre-schedule Khmer voice speech lines into the Audio Destination at their exact timeframe
      const schedule = calculateFitSchedule(segments, fitMode, { logPerSegment: false });
      let maxAudioFinishTime = videoDuration || 0;
      for (const seg of schedule.segments) {
        if (!seg.khmerText || !seg.khmerText.trim()) continue;
        const audioBuf = await khmerSynthesizer.getAudioBufferForSegment(seg, voiceSpeed);
        if (audioBuf) {
          const rate = seg.playbackRate || 1.0;
          let playBuf = audioBuf;
          if (Math.abs(rate - 1.0) >= 0.03) {
            playBuf = khmerSynthesizer.timeStretchAudioBuffer(audioBuf, rate);
          }
          const sourceNode = audioCtx.createBufferSource();
          sourceNode.buffer = playBuf;

          const voiceGain = audioCtx.createGain();
          voiceGain.gain.setValueAtTime(Math.min(1.5, Math.max(0.1, duckingConfig.voiceVolume)), audioCtx.currentTime);

          sourceNode.connect(voiceGain);
          voiceGain.connect(dest);

          // Start speech at relative time offset (effectiveStart)
          const startTime = Math.max(0, seg.effectiveStart);
          sourceNode.start(audioCtx.currentTime + startTime);

          const finishTime = startTime + playBuf.duration + 0.35;
          if (finishTime > maxAudioFinishTime) {
            maxAudioFinishTime = finishTime;
          }
        }
      }

      // Combine Canvas stream + Audio stream
      const canvasStream = canvas.captureStream(30);
      const audioTracks = dest.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        canvasStream.addTrack(audioTracks[0]);
      }

      // Detect optimal supported MediaRecorder mimeType
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
          mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          mimeType = 'video/webm;codecs=vp9,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }
      }

      const recordedChunks: Blob[] = [];
      const recorder = new MediaRecorder(canvasStream, {
        mimeType: mimeType.split(';')[0] === 'video/mp4' && MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
        videoBitsPerSecond: is720 ? 3500000 : 6000000,
        audioBitsPerSecond: 192000
      });

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      recorder.start(100);

      // Start video element if uploaded
      if (videoEl) {
        videoEl.currentTime = 0;
        videoEl.play().catch(() => {});
      }

      const totalDur = Math.max(3.0, videoDuration, maxAudioFinishTime);
      const startTime = performance.now();

      // Render loop frame-by-frame
      await new Promise<void>((resolve) => {
        const renderFrame = () => {
          if (abortExportRef.current) {
            recorder.stop();
            audioCtx.close().catch(() => {});
            return resolve();
          }

          const elapsed = (performance.now() - startTime) / 1000;
          const currentProgress = Math.min(96, 30 + Math.round((elapsed / totalDur) * 65));
          setExportProgress(currentProgress);
          setExportStatusText(`Rendering & Muxing video frames (${elapsed.toFixed(1)}s / ${totalDur.toFixed(1)}s)...`);

          // 1. Draw video background
          if (videoEl && !videoEl.paused && !videoEl.ended) {
            ctx.drawImage(videoEl, 0, 0, width, height);
          } else {
            // Procedural cinematic background
            const grad = ctx.createLinearGradient(0, 0, width, height);
            if (sceneType === 'action') {
              grad.addColorStop(0, '#1c1917');
              grad.addColorStop(0.5, '#451a03');
              grad.addColorStop(1, '#0c0a09');
            } else if (sceneType === 'scifi') {
              grad.addColorStop(0, '#020617');
              grad.addColorStop(0.5, '#1e1b4b');
              grad.addColorStop(1, '#090d16');
            } else {
              grad.addColorStop(0, '#1e293b');
              grad.addColorStop(0.5, '#0f172a');
              grad.addColorStop(1, '#020617');
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);

            // Dynamic cinematic film light flare
            const flareX = (width * 0.5) + Math.sin(elapsed * 1.5) * (width * 0.25);
            const flareY = (height * 0.4) + Math.cos(elapsed * 1.2) * (height * 0.15);
            const flare = ctx.createRadialGradient(flareX, flareY, 10, flareX, flareY, width * 0.45);
            flare.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
            flare.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = flare;
            ctx.fillRect(0, 0, width, height);
          }

          // 2. Draw Burned-in Subtitles if requested
          if (exportFormat === 'burned_mp4') {
            const active = segments.find(s => elapsed >= s.start && elapsed <= Math.max(s.end, s.start + (s.naturalDuration || 1.2)));
            if (active && active.khmerText) {
              const text = active.khmerText;
              const fontSize = Math.round(subtitleStyle.fontSize * (width / 720));
              const fontFam = subtitleStyle.fontFamily || 'Kantumruy Pro';

              ctx.save();
              ctx.font = `bold ${fontSize}px "${fontFam}", "Khmer OS", sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const textMetrics = ctx.measureText(text);
              const textWidth = textMetrics.width;
              const boxHeight = fontSize * 1.6;
              const boxWidth = textWidth + (fontSize * 1.2);
              
              const posX = width / 2;
              let posY = height - (height * 0.12);
              if (subtitleStyle.position === 'top') {
                posY = height * 0.12;
              } else if (subtitleStyle.position === 'center') {
                posY = height / 2;
              }

              // Background box
              if (subtitleStyle.backgroundBox) {
                ctx.fillStyle = `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity || 0.55})`;
                const cornerRadius = 8;
                const bx = posX - (boxWidth / 2);
                const by = posY - (boxHeight / 2);
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(bx, by, boxWidth, boxHeight, cornerRadius) : ctx.rect(bx, by, boxWidth, boxHeight);
                ctx.fill();
              }

              // Outline stroke
              if (subtitleStyle.outlineWidth > 0) {
                ctx.strokeStyle = subtitleStyle.outlineColor || '#000000';
                ctx.lineWidth = subtitleStyle.outlineWidth * 2;
                ctx.strokeText(text, posX, posY);
              }

              // Subtitle text
              ctx.fillStyle = subtitleStyle.textColor || '#FFFFFF';
              ctx.fillText(text, posX, posY);
              ctx.restore();
            }
          }

          if (elapsed >= totalDur) {
            recorder.stop();
            if (videoEl) videoEl.pause();
            audioCtx.close().catch(() => {});
            resolve();
          } else {
            requestAnimationFrame(renderFrame);
          }
        };

        requestAnimationFrame(renderFrame);
      });

      // Wait for recorder to assemble Blob
      await new Promise<void>(resolve => {
        recorder.onstop = () => {
          const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(recordedChunks, { type: mimeType.split(';')[0] });
          const url = URL.createObjectURL(blob);
          const filename = `${sanitizedTitle}_khmer_dubbed.${extension}`;

          setDownloadUrl(url);
          setDownloadFilename(filename);
          setDownloadMime(mimeType);
          setExportedFileSize(`${(blob.size / (1024 * 1024)).toFixed(2)} MB`);
          setExportProgress(100);
          setExportStatusText('Success! Khmer dubbed video rendered & ready to play.');
          setIsExporting(false);

          // Trigger automatic browser file download
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          resolve();
        };
      });

    } catch (err: any) {
      console.error('Export failed:', err);
      setIsExporting(false);
      setExportStatusText(`Export error: ${err?.message || 'Rendering failed'}`);
    }
  };

  const handleCancelExport = () => {
    abortExportRef.current = true;
    setIsExporting(false);
    setExportProgress(0);
    setExportStatusText('Export cancelled.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <Download className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Export Dubbed Movie & Captions</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                  Playable Video
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-kantumruy">
                ទាញយកវីដេអូបានបញ្ចូលសំឡេងខ្មែរពេញលេញ សម្រាប់ចាក់មើលភ្លាមៗ (WebM, MP4, WAV, SRT)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (isExporting) handleCancelExport();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-4">
          {/* Format Selection */}
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
              Export Output Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setExportFormat('burned_mp4')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  exportFormat === 'burned_mp4'
                    ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md ring-1 ring-amber-500/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-1">
                  <Film className="w-4 h-4 text-amber-400" />
                  <span>Video + Burned Subtitles</span>
                </div>
                <p className="text-[11px] text-slate-400 font-kantumruy">
                  វីដេអូមានសំឡេងខ្មែរ + អក្សររត់ស្រាប់ ក្នុងទម្រង់ {aspectRatio}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('clean_mp4')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  exportFormat === 'clean_mp4'
                    ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md ring-1 ring-amber-500/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-1">
                  <Film className="w-4 h-4 text-blue-400" />
                  <span>Clean Video + Mixed Audio</span>
                </div>
                <p className="text-[11px] text-slate-400 font-kantumruy">
                  វីដេអូបញ្ចូលសំឡេងខ្មែរ គ្មានអក្សរបាំងមុខ (Clean Dubbing)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('audio_only')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  exportFormat === 'audio_only'
                    ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md ring-1 ring-amber-500/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-1">
                  <Music className="w-4 h-4 text-purple-400" />
                  <span>Master Mixed Audio (WAV)</span>
                </div>
                <p className="text-[11px] text-slate-400 font-kantumruy">
                  សំឡេងខ្មែរពេញលេញ ៤៤.១kHz តាមពេលវេលាក្នុងរឿង (Timeframe Master)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('srt_only')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  exportFormat === 'srt_only'
                    ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md ring-1 ring-amber-500/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-1">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>SRT / VTT Subtitles</span>
                </div>
                <p className="text-[11px] text-slate-400 font-kantumruy">
                  ទាញយកតែឯកសារ Subtitle ខ្មែរ Unicode សុទ្ធ (.srt, .vtt)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('ffmpeg_cmd')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer sm:col-span-2 ${
                  exportFormat === 'ffmpeg_cmd'
                    ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md ring-1 ring-amber-500/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-1">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span>FFmpeg CLI Command (Terminal / Production)</span>
                </div>
                <p className="text-[11px] text-slate-400 font-kantumruy">
                  បង្កើតកូដ FFmpeg ស្វ័យប្រវត្តិកំណត់ atempo (max 1.2x), adelay និង freeze-frame tpad
                </p>
              </button>
            </div>
          </div>

          {/* Resolution & Aspect Ratio */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400 block text-[11px] uppercase font-semibold mb-1">Aspect Ratio</span>
              <span className="font-bold text-white flex items-center gap-1.5">
                {aspectRatio === '9:16' ? <Smartphone className="w-3.5 h-3.5 text-amber-400" /> : <Monitor className="w-3.5 h-3.5 text-amber-400" />}
                <span>{aspectRatio} ({aspectRatio === '9:16' ? 'TikTok/Reels' : aspectRatio === '1:1' ? 'Square' : 'Widescreen'})</span>
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400 block text-[11px] uppercase font-semibold mb-1">Resolution</span>
              <div className="flex gap-2">
                {(['720p', '1080p'] as const).map(res => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setResolution(res)}
                    className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase cursor-pointer ${
                      resolution === res ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white bg-slate-900'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress or Render Button */}
          {isExporting ? (
            <div className="space-y-3 p-4 rounded-xl bg-slate-950 border border-amber-500/40">
              <div className="flex justify-between items-center text-xs text-slate-200">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{exportStatusText || 'Encoding video & mixing audio tracks...'}</span>
                </span>
                <span className="font-mono text-amber-400 font-bold text-sm">{exportProgress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-200"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCancelExport}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-red-400 underline cursor-pointer"
                >
                  Cancel Export
                </button>
              </div>
            </div>
          ) : downloadUrl ? (
            <div className="p-4 rounded-2xl bg-emerald-950/35 border border-emerald-500/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Export & Audio Muxing Completed!</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-300">
                  {exportedFileSize}
                </span>
              </div>

              {/* Direct Playable Video Preview */}
              {downloadMime.startsWith('video') && (
                <div className="rounded-xl overflow-hidden bg-black border border-slate-800 max-h-[180px] flex items-center justify-center">
                  <video
                    ref={previewVideoRef}
                    src={downloadUrl}
                    controls
                    playsInline
                    className="w-full max-h-[180px] object-contain"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={downloadUrl}
                  download={downloadFilename}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {downloadFilename.endsWith('.wav') ? 'Master Audio (.WAV)' : 'Dubbed Video'}</span>
                </a>

                <button
                  type="button"
                  onClick={handleDownloadSrt}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                  title="Download SRT subtitle file"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>SRT</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDownloadUrl(null);
                    setExportProgress(0);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white text-xs border border-slate-700 cursor-pointer"
                >
                  Export Another
                </button>
              </div>
            </div>
          ) : exportFormat === 'ffmpeg_cmd' ? (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 font-mono flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span>FFmpeg CLI Command ({fitMode})</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const cmd = generateFfmpegDubbingCommand(segments, fitMode, videoSrc ? 'movie.mp4' : 'input.mp4');
                    navigator.clipboard.writeText(cmd);
                    setCopiedFfmpeg(true);
                    setTimeout(() => setCopiedFfmpeg(false), 2000);
                  }}
                  className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {copiedFfmpeg ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFfmpeg ? 'Copied!' : 'Copy FFmpeg Script'}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-[220px] whitespace-pre leading-relaxed select-all">
                {generateFfmpegDubbingCommand(segments, fitMode, videoSrc ? 'movie.mp4' : 'input.mp4')}
              </pre>
              <p className="text-[11px] text-slate-400 font-kantumruy">
                {fitMode === 'keep_all_speech'
                  ? '• របៀប "Keep all speech (video waits)": ប្រើ atempo (max 1.2x) និងពន្យារូបភាពវីដេអូត្រង់ឈុតកាត់ ដើម្បីនិយាយឱ្យចប់ប្រយោគពេញលេញ។'
                  : '• របៀប "Keep video timing": ប្រើ atempo (max 1.2x) និង adelay តាមលំដាប់លំដោយ មិនជាន់គ្នាឡើយ។'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleStartRender}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-bold text-xs sm:text-sm shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                <span>
                  {exportFormat === 'audio_only'
                    ? 'Render Master Mixed Audio WAV'
                    : exportFormat === 'srt_only'
                    ? 'Download Timed Subtitles (SRT)'
                    : 'Render & Export Dubbed Video (MP4 / WebM)'}
                </span>
              </button>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-400 pt-1 font-kantumruy">
                <button type="button" onClick={handleDownloadSrt} className="hover:text-amber-400 underline cursor-pointer">
                  ទាញយក .SRT ផ្ទាល់
                </button>
                <span>•</span>
                <button type="button" onClick={handleDownloadVtt} className="hover:text-amber-400 underline cursor-pointer">
                  ទាញយក .VTT ផ្ទាល់
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
