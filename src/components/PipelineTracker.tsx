import React from 'react';
import { 
  Download, Music, Scissors, FileText, Languages, 
  Edit3, Mic, Activity, Sliders, CheckCircle2, 
  Play, Pause, ArrowRight, Loader2, Sparkles, Terminal
} from 'lucide-react';
import { PipelineStage, getStageProgress } from '../utils/dubbingEngine.ts';

interface PipelineTrackerProps {
  currentStage: PipelineStage;
  isProcessing: boolean;
  onProceedToVoice: () => void;
  onRestartPipeline: () => void;
  logs: string[];
}

interface StageStep {
  id: PipelineStage;
  label: string;
  labelKhmer: string;
  icon: React.ElementType;
  description: string;
}

const STAGES: StageStep[] = [
  { id: 'download', label: '1. Download', labelKhmer: 'ទាញយកវីដេអូ', icon: Download, description: 'yt-dlp fetch video & audio' },
  { id: 'extract', label: '2. Extract', labelKhmer: 'ទាញយកសំឡេង', icon: Music, description: 'FFmpeg 44.1kHz WAV split' },
  { id: 'separate', label: '3. Separate', labelKhmer: 'បំបែកសម្លេងនិយាយ & BGM', icon: Scissors, description: 'Demucs UVR vocal isolation' },
  { id: 'transcribe', label: '4. Transcribe', labelKhmer: 'បម្លែងសំឡេងជាអក្សរ', icon: FileText, description: 'Faster-Whisper timestamps' },
  { id: 'translate', label: '5. Translate', labelKhmer: 'បកប្រែជាភាសាខ្មែរ', icon: Languages, description: 'Gemini cinematic adaptation' },
  { id: 'user_editing', label: 'Pause: Review', labelKhmer: 'ពិនិត្យអត្ថបទខ្មែរ', icon: Edit3, description: 'Edit text before TTS credits' },
  { id: 'voice', label: '6. Khmer TTS', labelKhmer: 'បង្កើតសំឡេងខ្មែរ', icon: Mic, description: 'VoxCPM2 48kHz Khmer LoRA' },
  { id: 'sync', label: '7. Time Sync', labelKhmer: 'តម្រឹម timing ជាមួយរឿង', icon: Activity, description: 'Rubberband time-stretching' },
  { id: 'mix', label: '8. Ducking Mix', labelKhmer: 'លាយសំឡេង & Ducking', icon: Sliders, description: 'FFmpeg sidechain compressor' },
  { id: 'completed', label: '9. Ready', labelKhmer: 'រួចរាល់សម្រាប់ Export', icon: CheckCircle2, description: 'MP4, SRT & styled subtitles' }
];

export const PipelineTracker: React.FC<PipelineTrackerProps> = ({
  currentStage,
  isProcessing,
  onProceedToVoice,
  onRestartPipeline,
  logs
}) => {
  const currentProgress = getStageProgress(currentStage);
  const isPauseStage = currentStage === 'user_editing';
  const currentIndex = STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 lg:p-5 shadow-xl backdrop-blur-md">
      {/* Progress Bar Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-amber-400 uppercase">
              Pipeline Workflow
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400">
              {isPauseStage ? (
                <span className="text-amber-300 font-semibold flex items-center gap-1">
                  <Edit3 className="w-3.5 h-3.5" /> Paused for User Script Editing (Free Review)
                </span>
              ) : isProcessing ? (
                <span className="text-blue-400 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing stage...
                </span>
              ) : (
                'Stage ready'
              )}
            </span>
          </div>
          <h3 className="text-base font-bold text-white mt-0.5">
            {STAGES[Math.max(0, currentIndex)]?.label} — {STAGES[Math.max(0, currentIndex)]?.labelKhmer}
          </h3>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {isPauseStage ? (
            <button
              onClick={onProceedToVoice}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition-all"
            >
              <span>Approve Script & Synthesize Voices</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onRestartPipeline}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Re-run Pipeline
            </button>
          )}
        </div>
      </div>

      {/* Visual Step Nodes */}
      <div className="relative mb-4">
        {/* Progress line */}
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden w-full absolute top-5 left-0 z-0">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-cyan-400 transition-all duration-500 ease-out"
            style={{ width: `${currentProgress}%` }}
          />
        </div>

        {/* Horizontal Stepper Grid */}
        <div className="relative z-10 grid grid-cols-5 md:grid-cols-10 gap-1.5 pt-1">
          {STAGES.map((step, idx) => {
            const isCompleted = idx < currentIndex || currentStage === 'completed';
            const isCurrent = step.id === currentStage;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex flex-col items-center text-center group">
                <div 
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent
                      ? step.id === 'user_editing'
                        ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/30 scale-110 shadow-lg shadow-amber-500/40 animate-pulse'
                        : 'bg-blue-600 text-white ring-4 ring-blue-500/30 scale-110 shadow-lg shadow-blue-600/40'
                      : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60'
                  }`}
                  title={`${step.label}: ${step.description}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-[11px] font-semibold mt-1.5 line-clamp-1 ${
                  isCurrent ? 'text-amber-300 font-bold' : isCompleted ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  {step.label.split('. ')[1] || step.label}
                </span>
                <span className="text-[9px] text-slate-400 hidden md:block line-clamp-1 font-kantumruy">
                  {step.labelKhmer}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal / Live Pipeline Output Log Drawer */}
      <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 font-mono text-[11px] text-slate-300 flex items-center justify-between overflow-hidden">
        <div className="flex items-center gap-2 overflow-hidden">
          <Terminal className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-slate-500 flex-shrink-0">[Pipeline Log]:</span>
          <span className="text-emerald-400 truncate">
            {logs[logs.length - 1] || 'Ready. Select a project or clip to start.'}
          </span>
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider flex-shrink-0 ml-2">
          {currentProgress}% Complete
        </span>
      </div>
    </div>
  );
};
