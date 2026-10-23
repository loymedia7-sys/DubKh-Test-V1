import React, { useState } from 'react';
import { 
  Code, Copy, Check, Download, FileCode, Folder, 
  Terminal, Server, Layers, Cpu, Database, Play
} from 'lucide-react';
import { PIPELINE_FILES, CodeFile } from '../data/pipelineCode.ts';

export const PipelineCodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<CodeFile>(PIPELINE_FILES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([selectedFile.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Overview */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-xl">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold border border-indigo-500/20">
              Full-Stack Architecture & Scripts
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-amber-400 font-kantumruy">កូដប្រព័ន្ធដំណើរការ Dubbing ទាំងមូល</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Production Python Backend Pipeline (Stages 1 to 9)
          </h2>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            All starter scripts for running the 9-stage video dubbing pipeline locally or on a GPU cluster (FastAPI, Celery, Demucs vocal isolation, Whisper transcription, Gemini translation, and OpenBMB VoxCPM2 48kHz Khmer LoRA TTS).
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-850">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Audio Separation</span>
              <span className="text-xs font-bold text-white flex items-center gap-1 mt-0.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" /> Demucs HT
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-850">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">AI Translation</span>
              <span className="text-xs font-bold text-white flex items-center gap-1 mt-0.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" /> Gemini 3.8 Flash
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-850">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Khmer Voice</span>
              <span className="text-xs font-bold text-white flex items-center gap-1 mt-0.5">
                <Server className="w-3.5 h-3.5 text-emerald-400" /> VoxCPM2 48kHz LoRA
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-850">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Job Queue</span>
              <span className="text-xs font-bold text-white flex items-center gap-1 mt-0.5">
                <Database className="w-3.5 h-3.5 text-rose-400" /> Celery + Redis
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Code Explorer Window */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[560px]">
        {/* Left Sidebar: File Tree */}
        <div className="w-full md:w-64 bg-slate-900/70 border-r border-slate-800 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider px-2 py-1.5 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              <span>Pipeline Scripts</span>
            </div>

            <div className="space-y-1 mt-1">
              {PIPELINE_FILES.map(file => {
                const isSelected = selectedFile.filename === file.filename;
                return (
                  <button
                    key={file.filename}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono flex items-center gap-2 transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                    <span className="truncate">{file.filename}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-850 mt-4 text-[11px] text-slate-400 space-y-1">
            <span className="font-bold text-white block">Execution Guide:</span>
            <p>1. <code className="text-amber-300">pip install -r reqs.txt</code></p>
            <p>2. <code className="text-amber-300">docker compose up -d</code></p>
          </div>
        </div>

        {/* Right Pane: Code View & Controls */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {/* File Header */}
          <div className="px-5 py-3.5 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between text-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-white font-bold">{selectedFile.path}</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-amber-400 font-mono">
                  {selectedFile.language}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {selectedFile.description}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
              <button
                onClick={handleDownloadFile}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-amber-500/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .py</span>
              </button>
            </div>
          </div>

          {/* Syntax Code Editor Frame */}
          <div className="flex-1 p-4 overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed max-h-[500px] overflow-y-auto">
            <pre>
              <code>{selectedFile.code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
