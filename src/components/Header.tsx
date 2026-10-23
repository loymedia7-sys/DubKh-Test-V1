import React from 'react';
import { Film, Sparkles, CreditCard, Code, Download, Play, RefreshCw, Wand2, UploadCloud, Zap } from 'lucide-react';

interface HeaderProps {
  credits: number;
  onOpenCreditsModal: () => void;
  activeTab: 'studio' | 'pipeline_code' | 'export';
  setActiveTab: (tab: 'studio' | 'pipeline_code' | 'export') => void;
  onLoadSample: (sampleId: string) => void;
  currentProjectTitle: string;
  onOpenUploadModal: () => void;
  onOpenNiceOneDubberModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  credits,
  onOpenCreditsModal,
  activeTab,
  setActiveTab,
  onLoadSample,
  currentProjectTitle,
  onOpenUploadModal,
  onOpenNiceOneDubberModal
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Project Info */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-red-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-amber-500/20 ring-1 ring-white/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">KhmerDub <span className="text-amber-400">AI</span></span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-medium border border-amber-500/20">
                  ស្ទូឌីយោបញ្ចូលសំឡេង
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-1">
                {currentProjectTitle}
              </p>
            </div>
          </div>

          {/* Upload Video Primary Button & Sample Selector */}
          <div className="hidden lg:flex items-center gap-2.5 ml-4 pl-4 border-l border-slate-800 text-xs">
            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload Video</span>
            </button>

            <span className="text-slate-600 font-medium ml-1">|</span>

            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Demo:
            </span>
            <button
              onClick={() => onLoadSample('action')}
              className="px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
            >
              Angkor Action
            </button>
            <button
              onClick={() => onLoadSample('drama')}
              className="px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
            >
              Royal Drama
            </button>
            <button
              onClick={() => onLoadSample('scifi')}
              className="px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
            >
              Sci-Fi 2099
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('studio')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'studio'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            Studio & Editor
          </button>
          <button
            onClick={() => setActiveTab('pipeline_code')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'pipeline_code'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Python Pipeline & API
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'export'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Export & Downloads
          </button>
        </div>

        {/* Credits & Bakong KHQR Button & Nice One Dubber Workflow */}
        <div className="flex items-center gap-2.5">
          {onOpenNiceOneDubberModal && (
            <button
              onClick={onOpenNiceOneDubberModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 hover:from-amber-500/30 hover:to-red-500/30 text-amber-300 font-bold text-xs border border-amber-500/40 shadow-sm transition-all cursor-pointer"
              title="Open Nice One Dubber & PyVideoTrans AI Workflow (Piseth & Sreymom Neural Tuning)"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Nice One Dubber</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200 text-[10px] font-mono">
                Edge TTS
              </span>
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <div className="text-xs">
              <span className="text-slate-400">Credits: </span>
              <span className="font-bold text-emerald-400">{credits} mins</span>
            </div>
          </div>

          <button
            onClick={onOpenCreditsModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs font-semibold shadow-md shadow-red-600/20 transition-all border border-red-500/30"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Top Up (Bakong KHQR)</span>
          </button>
        </div>
      </div>
    </header>
  );
};
