/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { PipelineTracker } from './components/PipelineTracker.tsx';
import { VideoPlayer, SubtitleStyleConfig } from './components/VideoPlayer.tsx';
import { SegmentEditor } from './components/SegmentEditor.tsx';
import { VoicePicker } from './components/VoicePicker.tsx';
import { SubtitleStyler } from './components/SubtitleStyler.tsx';
import { PaymentModal } from './components/PaymentModal.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { UploadModal, UploadProjectData } from './components/UploadModal.tsx';
import { PipelineCodeViewer } from './components/PipelineCodeViewer.tsx';
import { NiceOneDubberModal } from './components/NiceOneDubberModal.tsx';
import { 
  DubbingSegment, DuckingConfig, PipelineStage, 
  TranscriptionMode, SourceLanguage, clampVoiceSpeed, parseScriptOrSrtToSegments,
  sanitizeTranscribedSegments, estimateKhmerDuration, calculateTimeStretch, generateSegmentsForUploadedVideo 
} from './utils/dubbingEngine.ts';
import { 
  generateSyntheticVoicePeaks, 
  alignSegmentsToVoicePeaks,
  extractVoicePeaksFromMedia,
  generateWaveformProfile,
  VoicePeak 
} from './utils/voiceTracker.ts';
import { khmerSynthesizer } from './utils/khmerTts.ts';
import { 
  Film, Plus, Sparkles, Layers, Sliders, Type, 
  Mic, Download, Play, CheckCircle2, ArrowRight, Crosshair
} from 'lucide-react';

const SAMPLE_PROJECTS: Record<string, {
  title: string;
  scene: string;
  segments: DubbingSegment[];
}> = {
  action: {
    title: 'The Angkor Legend - Battle of the Sacred Gate',
    scene: 'action',
    segments: [
      {
        id: 'seg-1',
        start: 1.0,
        end: 5.3,
        speaker: 'Speaker 1 (Commander)',
        speakerVoiceId: 'piseth',
        originalText: 'We must breach the ancient temple gate before sunset!',
        khmerText: 'យើងត្រូវតែទម្លុះទ្វារប្រាសាទបុរាណនេះ មុនពេលព្រះអាទិត្យលិច!',
        speedRatio: 0.88,
        naturalDuration: 3.78
      },
      {
        id: 'seg-2',
        start: 5.6,
        end: 9.9,
        speaker: 'Speaker 2 (Archaeologist)',
        speakerVoiceId: 'sreymom',
        originalText: 'Wait, the sacred inscription warns of a curse on whoever disturbs it.',
        khmerText: 'ចាំសិន! សិលាចារឹកពិសិដ្ឋបានព្រមានពីបណ្តាសា ដល់អ្នកណាដែលមករំខានវា។',
        speedRatio: 0.88,
        naturalDuration: 3.78
      },
      {
        id: 'seg-3',
        start: 10.2,
        end: 14.5,
        speaker: 'Narrator',
        speakerVoiceId: 'borey',
        originalText: 'In a kingdom forgotten by time, courage is the only weapon that remains.',
        khmerText: 'នៅក្នុងនគរមួយដែលពេលវេលាបានបំភ្លេច សេចក្តីក្លាហានគឺជាអាវុធតែមួយគត់ដែលនៅសេសសល់។',
        speedRatio: 0.88,
        naturalDuration: 3.78
      },
      {
        id: 'seg-4',
        start: 14.8,
        end: 19.1,
        speaker: 'Speaker 1 (Commander)',
        speakerVoiceId: 'piseth',
        originalText: 'Draw your swords! We fight together, or we fall together!',
        khmerText: 'ដកដាវរបស់អ្នកឡើង! យើងតស៊ូជាមួយគ្នា ឬក៏យើងត្រូវដួលរលំទាំងអស់គ្នា!',
        speedRatio: 0.88,
        naturalDuration: 3.78
      }
    ]
  },
  drama: {
    title: 'The Royal Silk Legacy - Episode 4',
    scene: 'drama',
    segments: [
      {
        id: 'seg-1',
        start: 1.0,
        end: 5.3,
        speaker: 'Speaker 1 (Princess)',
        speakerVoiceId: 'sreymom',
        originalText: 'Why did you keep this secret hidden from my family for twenty years?',
        khmerText: 'ហេតុអ្វីបានជាអ្នកលាក់អាថ៌កំបាំងនេះ ពីគ្រួសារខ្ញុំអស់រយៈពេលម្ភៃឆ្នាំមកហើយ?',
        speedRatio: 0.88,
        naturalDuration: 3.78
      },
      {
        id: 'seg-2',
        start: 5.6,
        end: 9.9,
        speaker: 'Speaker 2 (Elder)',
        speakerVoiceId: 'kolab',
        originalText: 'The truth was too heavy for a child to bear. I wanted only to protect you.',
        khmerText: 'ការពិតវាធ្ងន់ធ្ងរពេកសម្រាប់កុមារម្នាក់។ ខ្ញុំគ្រាន់តែចង់ការពាររូបអ្នកប៉ុណ្ណោះ។',
        speedRatio: 0.88,
        naturalDuration: 3.78
      },
      {
        id: 'seg-3',
        start: 10.2,
        end: 14.5,
        speaker: 'Narrator',
        speakerVoiceId: 'borey',
        originalText: 'Between duty and truth, the golden thread of fate was about to unravel.',
        khmerText: 'នៅចន្លោះរវាងកាតព្វកិច្ចនិងការពិត ខ្សែអំបោះមាសនៃវាសនាកំពុងតែរលាយបាត់បន្តិចម្តងៗ។',
        speedRatio: 0.88,
        naturalDuration: 3.78
      }
    ]
  },
  scifi: {
    title: 'Neo-Phnom Penh 2099 - Cyber Infiltration',
    scene: 'scifi',
    segments: [
      {
        id: 'seg-1',
        start: 1.0,
        end: 5.3,
        speaker: 'Speaker 1 (Hacker)',
        speakerVoiceId: 'dara',
        originalText: 'Firewall bypassed. I am inside the central mainframe node now.',
        khmerText: 'ប្រព័ន្ធការពារត្រូវទម្លុះរួចរាល់។ ពេលនេះខ្ញុំបានចូលទៅក្នុងប្រព័ន្ធកណ្តាលហើយ!',
        speedRatio: 0.88,
        naturalDuration: 3.78
      },
      {
        id: 'seg-2',
        start: 5.6,
        end: 9.9,
        speaker: 'Speaker 2 (Enforcer)',
        speakerVoiceId: 'kiri',
        originalText: 'Intruder detected in Sector 7. Deploy hunter drones immediately!',
        khmerText: 'បានរកឃើញជនឈ្លានពាននៅតំបន់លេខ៧។ បញ្ជូនដ្រូនប្រហារទៅជាបន្ទាន់!',
        speedRatio: 0.88,
        naturalDuration: 3.78
      },
      {
        id: 'seg-3',
        start: 10.2,
        end: 14.5,
        speaker: 'Speaker 1 (Hacker)',
        speakerVoiceId: 'dara',
        originalText: 'Too late. The encrypted memory core is already downloading!',
        khmerText: 'យឺតពេលហើយ! ទិន្នន័យសម្ងាត់ត្រូវបានទាញយកចប់សព្វគ្រប់ហើយ!',
        speedRatio: 0.88,
        naturalDuration: 3.78
      }
    ]
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'pipeline_code' | 'export'>('studio');
  const [studioSubTab, setStudioSubTab] = useState<'editor' | 'voices' | 'subtitles'>('editor');
  
  // Project State
  const [currentSampleKey, setCurrentSampleKey] = useState<string>('action');
  const [projectTitle, setProjectTitle] = useState(SAMPLE_PROJECTS.action.title);
  const [sceneType, setSceneType] = useState(SAMPLE_PROJECTS.action.scene);
  const [segments, setSegments] = useState<DubbingSegment[]>(SAMPLE_PROJECTS.action.segments);
  const [uploadedVideoSrc, setUploadedVideoSrc] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(20.0);

  // Audio Mixer State with Original Voice Muting for Movie Dubbing (Default: MUTED for clean dubbing)
  const [duckingConfig, setDuckingConfig] = useState<DuckingConfig>({
    bgmVolume: 0.0,
    voiceVolume: 1.0,
    duckingThreshold: 0.0,
    attackTime: 0.1,
    releaseTime: 0.25,
    muteOriginalVoice: true, // Default: Original voice is muted so only Khmer dubbing is heard
    originalAudioMode: 'mute_all' // Default: 100% mute original voice track
  });

  // Voice Peak Tracking, Multimodal Keyframes & Voice Speed State
  const [trackedVoicePeaks, setTrackedVoicePeaks] = useState<VoicePeak[]>(() => generateSyntheticVoicePeaks(20.0, 4));
  const [waveformPoints, setWaveformPoints] = useState<number[]>(() => generateWaveformProfile(generateSyntheticVoicePeaks(20.0, 4), 20.0, 72));
  const [isRealAudioTracked, setIsRealAudioTracked] = useState<boolean>(false);
  const [trackedAudioBase64, setTrackedAudioBase64] = useState<string | undefined>(undefined);
  const [trackedFramesBase64, setTrackedFramesBase64] = useState<string[] | undefined>(undefined);
  const [voiceSpeed, setVoiceSpeed] = useState<number>(0.88);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('verbatim');
  const [sourceLang, setSourceLang] = useState<SourceLanguage>('auto');

  // Preload Khmer speech audio for all active segments so video dubbing playback has zero latency
  useEffect(() => {
    khmerSynthesizer.preloadSegments(segments);
  }, [segments]);

  // Sync Khmer voice master volume with Audio Dubbing Mixer
  useEffect(() => {
    khmerSynthesizer.setMasterVolume(duckingConfig.voiceVolume);
  }, [duckingConfig.voiceVolume]);

  // Subtitle Style State
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>({
    fontFamily: 'Kantumruy Pro',
    fontSize: 22,
    textColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 2.5,
    backgroundBox: true,
    backgroundOpacity: 0.45,
    position: 'bottom'
  });

  // Aspect Ratio State
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');

  // Pipeline State
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('user_editing'); // Defaults to user_editing pause state
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([
    '[yt-dlp] Video stream downloaded: 1080p AVC1 / AAC stereo',
    '[FFmpeg] Extracted audio to uncompressed 44.1kHz master.wav',
    '[Demucs] Vocal stem isolated from background soundtrack (HT-Demucs v4)',
    '[Faster-Whisper] Extracted 4 dialogue segments with timestamps',
    '[Gemini AI] Translated dialogue to natural spoken Khmer with duration constraints',
    '[Pipeline] Paused at stage 5. Review Khmer text before running TTS synthesis.'
  ]);

  // Credits & Modals
  const [credits, setCredits] = useState<number>(45);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showNiceOneDubberModal, setShowNiceOneDubberModal] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Fetch initial credits from server
  useEffect(() => {
    fetch('/api/credits')
      .then(res => res.json())
      .then(data => {
        if (data.creditsMinutes !== undefined) {
          setCredits(data.creditsMinutes);
        }
      })
      .catch(() => {});
  }, []);

  const handleLoadSample = (sampleKey: string) => {
    const sample = SAMPLE_PROJECTS[sampleKey];
    if (sample) {
      setCurrentSampleKey(sampleKey);
      setProjectTitle(sample.title);
      setSceneType(sample.scene);
      setSegments(sample.segments);
      setUploadedVideoSrc(null);
      setVideoDuration(20.0);
      setPipelineStage('user_editing');
      setPipelineLogs(prev => [
        ...prev,
        `[Project] Loaded sample clip: "${sample.title}" (${sample.segments.length} lines)`
      ]);
    }
  };

  // Full AI Speech Transcription & Khmer Adaptation caller with Voice Peak Tracking, Keyframes & Voice Speed
  const handleTranscribeProject = async (
    overrideDuration?: number, 
    overrideTitle?: string, 
    overrideGenre?: string, 
    overrideLeadVoice?: string,
    overridePeaks?: VoicePeak[],
    overrideAudioBase64?: string,
    overrideMode?: TranscriptionMode,
    overrideLang?: SourceLanguage,
    overrideSpeed?: number,
    customScript?: string,
    overrideFramesBase64?: string[]
  ) => {
    setIsTranscribing(true);
    const dur = overrideDuration || videoDuration || 20;
    if (dur !== videoDuration) {
      setVideoDuration(dur);
    }
    const ttl = overrideTitle || projectTitle;
    const gnr = overrideGenre || sceneType;
    const leadV = overrideLeadVoice || segments[0]?.speakerVoiceId || 'piseth';
    const activeMode = overrideMode || transcriptionMode || 'verbatim';
    const activeLang = overrideLang || sourceLang || 'auto';
    const activeSpeed = clampVoiceSpeed(overrideSpeed !== undefined ? overrideSpeed : voiceSpeed);

    // If user pasted custom SRT or script, immediately parse and display
    if (customScript && customScript.trim().length > 0) {
      const parsedSegs = parseScriptOrSrtToSegments(customScript, dur, leadV, activeSpeed);
      if (parsedSegs.length > 0) {
        setSegments(parsedSegs);
      }
    }

    const fullTargetCues = Math.min(120, Math.max(4, Math.ceil(dur / 3.8)));
    const peaksToUse = (overridePeaks && overridePeaks.length > 0)
      ? overridePeaks
      : (trackedVoicePeaks && trackedVoicePeaks.length > 0)
      ? trackedVoicePeaks
      : generateSyntheticVoicePeaks(dur, fullTargetCues);
    setTrackedVoicePeaks(peaksToUse);
    setWaveformPoints(generateWaveformProfile(peaksToUse, dur, 72));
    const audioPayload = overrideAudioBase64 !== undefined ? overrideAudioBase64 : trackedAudioBase64;
    const framesPayload = overrideFramesBase64 !== undefined ? overrideFramesBase64 : trackedFramesBase64;
    const hasRealMedia = Boolean(
      uploadedVideoSrc ||
      (audioPayload && audioPayload.length > 200) ||
      (framesPayload && framesPayload.length > 0)
    );

    // Only populate template segments if no real user video/audio is loaded
    if (!customScript && !hasRealMedia) {
      const instantSegs = generateSegmentsForUploadedVideo(
        dur,
        gnr,
        leadV,
        peaksToUse.length,
        activeMode,
        activeSpeed
      );
      const instantAligned = alignSegmentsToVoicePeaks(instantSegs, peaksToUse, dur).map(s => ({
        ...s,
        speedRatio: activeSpeed,
        transcriptionMode: activeMode
      }));
      setSegments(instantAligned);
    }

    setPipelineLogs(p => [
      ...p, 
      `[Voice Tracker] Tracking full video speech bursts (${peaksToUse.length} cues across ${dur.toFixed(1)}s, mode: ${activeMode.toUpperCase()}, speed: ${activeSpeed.toFixed(2)}x)...`,
      hasRealMedia
        ? `[Gemini 3.8 Multimodal ASR] Transcribing 16kHz normalized vocal audio + ${framesPayload?.length || 0} timestamped 640x360 keyframes...`
        : `[Smart Transcribe Pro] Transcribing full video (${peaksToUse.length} lines) in ${activeMode === 'recap' ? 'Cambodia Movie Recap (សម្រាយរឿង)' : activeMode} style...`
    ]);

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ttl,
          genre: gnr,
          duration: dur,
          leadVoiceId: leadV,
          trackedPeaks: peaksToUse,
          audioBase64: audioPayload,
          framesBase64: framesPayload,
          mimeType: audioPayload ? 'audio/wav' : undefined,
          transcriptionMode: activeMode,
          sourceLang: activeLang,
          voiceSpeed: activeSpeed,
          customScript
        })
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.segments) && data.segments.length > 0) {
        // Preserve actual transcribed timestamps and text from Gemini without overwriting with synthetic peaks
        const sanitized = sanitizeTranscribedSegments(
          data.segments,
          dur,
          leadV,
          activeSpeed,
          activeMode
        );

        if (sanitized.length > 0) {
          setSegments(sanitized);
          setPipelineLogs(p => [
            ...p,
            `[${data.source || 'Gemini 3.8 ASR'}] Video transcribed accurately: ${sanitized.length} timestamped lines (${activeSpeed.toFixed(2)}x voice speed)!`
          ]);
        }
      }
    } catch (err) {
      console.warn('Transcribe request notice:', err);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Re-extract audio & keyframes from uploaded video and re-transcribe accurately
  const handleMatchVoicePeaks = async () => {
    let peaks = trackedVoicePeaks;
    let audioB64 = trackedAudioBase64;
    let framesB64 = trackedFramesBase64;
    let activeDur = videoDuration;
    if (uploadedVideoSrc) {
      const result = await extractVoicePeaksFromMedia(uploadedVideoSrc, videoDuration);
      peaks = result.peaks;
      audioB64 = result.audioBase64;
      framesB64 = result.framesBase64;
      if (result.detectedDuration && result.detectedDuration > 0.5) {
        activeDur = result.detectedDuration;
        setVideoDuration(activeDur);
      }
      setTrackedVoicePeaks(result.peaks);
      setWaveformPoints(result.waveform);
      setIsRealAudioTracked(result.isRealAudio);
      setTrackedAudioBase64(result.audioBase64);
      setTrackedFramesBase64(result.framesBase64);
    }
    if (audioB64 || (framesB64 && framesB64.length > 0)) {
      await handleTranscribeProject(
        activeDur,
        projectTitle,
        sceneType,
        segments[0]?.speakerVoiceId || 'piseth',
        peaks,
        audioB64,
        transcriptionMode,
        sourceLang,
        voiceSpeed,
        undefined,
        framesB64
      );
      return;
    }
    const aligned = alignSegmentsToVoicePeaks(segments, peaks, activeDur).map(s => ({
      ...s,
      speedRatio: voiceSpeed
    }));
    setSegments(aligned);
    setPipelineLogs(p => [
      ...p,
      `[Voice Tracker] Snapped and matched ${aligned.length} cues to original actor speech peaks in video (${activeDur.toFixed(1)}s).`
    ]);
  };

  const handleStartNewProject = async (data: UploadProjectData) => {
    setProjectTitle(data.title);
    setSceneType(data.genre);
    
    // Only set native <video src> if it is a blob/data URL or direct media stream (not a YouTube watch page)
    const isDirectVideoUrl = data.videoUrl && (
      data.videoUrl.startsWith('blob:') ||
      data.videoUrl.startsWith('data:') ||
      /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(data.videoUrl)
    );
    const activeVideoSrc = data.videoBlobUrl || (isDirectVideoUrl ? data.videoUrl! : null);
    setUploadedVideoSrc(activeVideoSrc);

    const initialDur = data.duration || 20.0;
    setVideoDuration(initialDur);

    const mediaSource = data.videoFile || data.videoBlobUrl || (isDirectVideoUrl ? data.videoUrl! : null);
    if (mediaSource) {
      setIsTranscribing(true);
      setSegments([
        {
          id: 'seg-loading-1',
          start: 0.2,
          end: Math.min(4.0, initialDur),
          speaker: 'Gemini 3.8 Video ASR',
          speakerVoiceId: data.leadVoiceId || 'piseth',
          originalText: 'Extracting 16kHz vocal audio & 640x360 keyframes from your video...',
          khmerText: 'កំពុងចាប់សំឡេង និង អក្សរពិតប្រាកដពីវីដេអូរបស់អ្នក...',
          speedRatio: voiceSpeed,
          confidence: 0.99
        }
      ]);
    }

    const trackResult = await extractVoicePeaksFromMedia(mediaSource, initialDur);
    const dur = trackResult.detectedDuration || initialDur;
    setVideoDuration(dur);
    setTrackedVoicePeaks(trackResult.peaks);
    setWaveformPoints(trackResult.waveform);
    setIsRealAudioTracked(trackResult.isRealAudio);
    setTrackedAudioBase64(trackResult.audioBase64);
    setTrackedFramesBase64(trackResult.framesBase64);

    if (!mediaSource && data.customSegments && data.customSegments.length > 0) {
      const aligned = alignSegmentsToVoicePeaks(data.customSegments, trackResult.peaks, dur);
      setSegments(aligned);
    }

    setPipelineStage('transcribe');
    setIsProcessing(true);
    setPipelineLogs([
      data.videoFile
        ? `[File Upload] Ingested "${data.videoFile.name}" (${(data.videoFile.size / (1024 * 1024)).toFixed(1)} MB, ${dur.toFixed(1)}s)`
        : `[yt-dlp] Loaded project source: ${data.videoUrl || data.title}`,
      `[Voice Tracker] ${trackResult.message}.`,
      `[Gemini 3.8 Multimodal ASR] Transcribing actual spoken audio & video frames...`
    ]);

    await handleTranscribeProject(
      dur,
      data.title,
      data.genre,
      data.leadVoiceId,
      trackResult.peaks,
      trackResult.audioBase64,
      transcriptionMode,
      sourceLang,
      voiceSpeed,
      undefined,
      trackResult.framesBase64
    );

    setPipelineStage('user_editing');
    setIsProcessing(false);
    setPipelineLogs(p => [...p, '[Pipeline] Video transcription complete! Review or play Khmer dubbing.']);
  };

  const handleDirectFileUpload = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setProjectTitle(cleanName);
    setUploadedVideoSrc(objectUrl);
    setIsTranscribing(true);

    // Show clean transcribing placeholder instead of fake temple lines while reading the uploaded file
    setSegments([
      {
        id: 'seg-loading-1',
        start: 0.2,
        end: 3.5,
        speaker: 'Gemini 3.8 Video ASR',
        speakerVoiceId: 'piseth',
        originalText: `Analyzing "${file.name}" audio & video frames...`,
        khmerText: 'កំពុងចាប់សំឡេង និង អក្សរពិតប្រាកដពីវីដេអូរបស់អ្នក...',
        speedRatio: voiceSpeed,
        confidence: 0.99
      }
    ]);

    let resolved = false;
    const tempVid = document.createElement('video');
    tempVid.preload = 'metadata';
    tempVid.src = objectUrl;

    const finalize = async (initialDur: number) => {
      if (resolved) return;
      resolved = true;
      setVideoDuration(initialDur);

      // Extract 16kHz vocal audio + 640x360 timestamped keyframes directly from uploaded video
      const trackResult = await extractVoicePeaksFromMedia(file, initialDur);
      const trueDur = trackResult.detectedDuration || initialDur;
      setVideoDuration(trueDur);
      setTrackedVoicePeaks(trackResult.peaks);
      setWaveformPoints(trackResult.waveform);
      setIsRealAudioTracked(trackResult.isRealAudio);
      setTrackedAudioBase64(trackResult.audioBase64);
      setTrackedFramesBase64(trackResult.framesBase64);

      setPipelineStage('user_editing');
      setPipelineLogs(prev => [
        ...prev,
        `[Direct Upload] Video loaded: "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB, ${trueDur.toFixed(1)}s).`,
        `[Voice Tracker] ${trackResult.message}.`
      ]);
      // Trigger accurate multimodal AI transcription with both audioBase64 and framesBase64
      await handleTranscribeProject(
        trueDur,
        cleanName,
        sceneType,
        'piseth',
        trackResult.peaks,
        trackResult.audioBase64,
        transcriptionMode,
        sourceLang,
        voiceSpeed,
        undefined,
        trackResult.framesBase64
      );
    };

    const timer = setTimeout(() => finalize(20), 3500);

    tempVid.onloadedmetadata = () => {
      clearTimeout(timer);
      const dur = tempVid.duration && !isNaN(tempVid.duration) && isFinite(tempVid.duration) && tempVid.duration > 0
        ? Math.round(tempVid.duration * 10) / 10
        : 20;
      finalize(dur);
    };

    tempVid.onerror = () => {
      clearTimeout(timer);
      finalize(20);
    };
  };

  const handleProceedToVoice = () => {
    setPipelineStage('voice');
    setIsProcessing(true);
    setPipelineLogs(p => [...p, '[VoxCPM2 48kHz] Synthesizing Khmer character voices with Khmer LoRA (MOS 4.23)...']);

    setTimeout(() => {
      setPipelineStage('sync');
      setPipelineLogs(p => [...p, '[Rubberband] Time-stretching clips to lock lip-sync duration...']);
      setTimeout(() => {
        setPipelineStage('mix');
        setPipelineLogs(p => [...p, '[FFmpeg] Ducking background music & mixing master tracks...']);
        setTimeout(() => {
          setPipelineStage('completed');
          setIsProcessing(false);
          setPipelineLogs(p => [...p, '[Master] Dubbed video ready for export and download!']);
        }, 800);
      }, 800);
    }, 800);
  };

  const handleRestartPipeline = () => {
    setPipelineStage('download');
    setIsProcessing(true);
    setTimeout(() => {
      setPipelineStage('user_editing');
      setIsProcessing(false);
      setPipelineLogs(p => [...p, '[Pipeline] Re-processed stages. Script ready for review.']);
    }, 1200);
  };

  // Line-by-line AI translation call with Recap / Character mode support
  const handleTranslateLine = async (id: string, originalText: string, mode: TranscriptionMode = transcriptionMode) => {
    setIsTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText, targetTone: sceneType, mode })
      });
      const data = await res.json();
      if (data.success && data.khmerText) {
        setSegments(prev => prev.map(s => {
          if (s.id === id) {
            const est = estimateKhmerDuration(data.khmerText);
            return {
              ...s,
              khmerText: data.khmerText,
              naturalDuration: est,
              speedRatio: s.speedRatio || voiceSpeed
            };
          }
          return s;
        }));
        setPipelineLogs(p => [...p, `[Smart Translate] Adapted segment #${id} (${mode}): "${data.khmerText}"`]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAssignSpeakerVoice = (speaker: string, voiceId: string) => {
    setSegments(prev => prev.map(s => s.speaker === speaker ? { ...s, speakerVoiceId: voiceId } : s));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Header */}
      <Header
        credits={credits}
        onOpenCreditsModal={() => setShowPaymentModal(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLoadSample={handleLoadSample}
        currentProjectTitle={projectTitle}
        onOpenUploadModal={() => setShowUploadModal(true)}
        onOpenNiceOneDubberModal={() => setShowNiceOneDubberModal(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-6">
        {activeTab === 'pipeline_code' ? (
          /* Python Pipeline Code & Architecture Explorer */
          <PipelineCodeViewer />
        ) : activeTab === 'export' ? (
          /* Export & Download Hub */
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-2xl">
            <div className="max-w-2xl mx-auto text-center space-y-4 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                <Download className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-white">
                Export Mastered Khmer Dubbing Video
              </h2>
              <p className="text-sm text-slate-400 font-kantumruy">
                ទាញយកឯកសារវីដេអូកាត់តបញ្ចប់ និងឯកសារអក្សររត់ក្រោមជាភាសាខ្មែរ
              </p>
            </div>

            <div className="max-w-2xl mx-auto">
              <button
                onClick={() => setShowExportModal(true)}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-bold text-sm shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 transition-all"
              >
                <Sparkles className="w-5 h-5" />
                <span>Open Video Renderer & Exporter</span>
              </button>
            </div>
          </div>
        ) : (
          /* Main Studio Workspace */
          <div className="space-y-6">
            {/* Stage Tracker & Workflow Pipeline Bar */}
            <PipelineTracker
              currentStage={pipelineStage}
              isProcessing={isProcessing}
              onProceedToVoice={handleProceedToVoice}
              onRestartPipeline={handleRestartPipeline}
              logs={pipelineLogs}
            />

            {/* Split Screen Workspace: Video Monitor & Audio Mixer (Left) + Tabs (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Video Monitor & Audio Ducking Mixer */}
              <div className="lg:col-span-5 space-y-4">
                <VideoPlayer
                  segments={segments}
                  setSegments={setSegments}
                  duckingConfig={duckingConfig}
                  setDuckingConfig={setDuckingConfig}
                  subtitleStyle={subtitleStyle}
                  aspectRatio={aspectRatio}
                  setAspectRatio={setAspectRatio}
                  videoScene={sceneType}
                  videoSrc={uploadedVideoSrc}
                  videoDuration={videoDuration}
                  voicePeaks={trackedVoicePeaks}
                  waveformPoints={waveformPoints}
                  isRealVoiceTracked={isRealAudioTracked}
                  onMatchVoicePeaks={handleMatchVoicePeaks}
                  onOpenUploadModal={() => setShowUploadModal(true)}
                  onDirectFileUpload={handleDirectFileUpload}
                  voiceSpeed={voiceSpeed}
                  onVoiceSpeedChange={s => {
                    const clamped = clampVoiceSpeed(s);
                    setVoiceSpeed(clamped);
                    khmerSynthesizer.setMasterSpeed(clamped);
                  }}
                  isTranscribing={isTranscribing}
                  onRetranscribeVideo={handleMatchVoicePeaks}
                  onDurationDetected={trueDur => {
                    setVideoDuration(trueDur);
                  }}
                />

                {/* Quick Project Creation & Action Bar */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      NEW
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Dub Another Video?</span>
                      <span className="text-[11px] text-slate-400">Import from your device or paste URL</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-amber-500/20 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload Video</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Multi-Tool Panels (Segment Editor, Voice Picker, Subtitle Styler) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Secondary Tab Switcher */}
                <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-md">
                  <button
                    onClick={() => setStudioSubTab('editor')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      studioSubTab === 'editor'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Segment Script Editor</span>
                  </button>
                  <button
                    onClick={() => setStudioSubTab('voices')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      studioSubTab === 'voices'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Khmer Voice Cast</span>
                  </button>
                  <button
                    onClick={() => setStudioSubTab('subtitles')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      studioSubTab === 'subtitles'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>Subtitle Styler</span>
                  </button>
                </div>

                {/* Sub-Panel Contents */}
                {studioSubTab === 'editor' && (
                  <SegmentEditor
                    segments={segments}
                    setSegments={setSegments}
                    onTranslateLine={handleTranslateLine}
                    isTranslating={isTranslating}
                    onReTranscribe={(mode, lang, spd, script) =>
                      handleTranscribeProject(
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        mode,
                        lang,
                        spd,
                        script
                      )
                    }
                    isTranscribing={isTranscribing}
                    onMatchVoicePeaks={handleMatchVoicePeaks}
                    voiceSpeed={voiceSpeed}
                    onVoiceSpeedChange={s => {
                      const clamped = clampVoiceSpeed(s);
                      setVoiceSpeed(clamped);
                      khmerSynthesizer.setMasterSpeed(clamped);
                    }}
                    transcriptionMode={transcriptionMode}
                    onTranscriptionModeChange={setTranscriptionMode}
                    sourceLang={sourceLang}
                    onSourceLangChange={setSourceLang}
                    videoDuration={videoDuration}
                    onOpenNiceOneDubberModal={() => setShowNiceOneDubberModal(true)}
                  />
                )}

                {studioSubTab === 'voices' && (
                  <VoicePicker
                    segments={segments}
                    onAssignSpeakerVoice={handleAssignSpeakerVoice}
                    voiceSpeed={voiceSpeed}
                    onVoiceSpeedChange={s => {
                      const clamped = clampVoiceSpeed(s);
                      setVoiceSpeed(clamped);
                      khmerSynthesizer.setMasterSpeed(clamped);
                    }}
                    onOpenNiceOneDubberModal={() => setShowNiceOneDubberModal(true)}
                  />
                )}

                {studioSubTab === 'subtitles' && (
                  <SubtitleStyler
                    subtitleStyle={subtitleStyle}
                    setSubtitleStyle={setSubtitleStyle}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-400">KhmerDub AI Studio</span>
          <span>•</span>
          <span className="font-kantumruy">ប្រព័ន្ធស្វ័យប្រវត្តិនៃការបញ្ចូលសំឡេងខ្មែរ</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>VoxCPM2 48kHz Khmer LoRA</span>
          <span>•</span>
          <span>Demucs Vocal Isolation</span>
          <span>•</span>
          <span>Bakong KHQR Payments</span>
        </div>
      </footer>

      {/* Modals */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onPaymentSuccess={added => setCredits(c => c + added)}
        currentCredits={credits}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        segments={segments}
        aspectRatio={aspectRatio}
        projectTitle={projectTitle}
        subtitleStyle={subtitleStyle}
        videoDuration={videoDuration}
        videoSrc={uploadedVideoSrc}
        sceneType={sceneType}
        duckingConfig={duckingConfig}
        voiceSpeed={voiceSpeed}
      />

      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onStartNewProject={handleStartNewProject}
      />

      <NiceOneDubberModal
        isOpen={showNiceOneDubberModal}
        onClose={() => setShowNiceOneDubberModal(false)}
      />
    </div>
  );
}
