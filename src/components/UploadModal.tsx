import React, { useState, useRef } from 'react';
import { 
  X, UploadCloud, Link as LinkIcon, Film, Sparkles, 
  Check, ArrowRight, Shield, Play, FileVideo, AlertCircle, RefreshCw, CheckCircle2
} from 'lucide-react';
import { DubbingSegment, generateSegmentsForUploadedVideo } from '../utils/dubbingEngine.ts';

export interface UploadProjectData {
  title: string;
  genre: string;
  leadVoiceId: string;
  videoUrl?: string;
  videoFile?: File;
  videoBlobUrl?: string;
  duration?: number;
  customSegments?: DubbingSegment[];
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartNewProject: (data: UploadProjectData) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onStartNewProject
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload'); // Default to file upload!
  const [videoUrl, setVideoUrl] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('action');
  const [selectedLeadVoice, setSelectedLeadVoice] = useState('piseth');

  // File upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(20);
  const [videoResolution, setVideoResolution] = useState<string>('1080p');
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  if (!isOpen) return null;

  const processVideoFile = (file: File) => {
    setErrorMsg(null);
    setIsProcessingFile(true);
    setUploadedFile(file);

    // Set default project title from filename if not yet entered
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (!projectTitle) {
      setProjectTitle(cleanName);
    }

    const objectUrl = URL.createObjectURL(file);
    setVideoBlobUrl(objectUrl);

    // Default duration in case metadata extraction is delayed or restricted by browser
    setVideoDuration(20);

    // Read metadata via temporary HTML5 video element with safety timeout
    let resolved = false;
    const tempVid = document.createElement('video');
    tempVid.preload = 'metadata';
    tempVid.src = objectUrl;

    const finalize = (dur?: number, w?: number, h?: number) => {
      if (resolved) return;
      resolved = true;
      if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
        setVideoDuration(Math.round(dur * 10) / 10);
      }
      if (w && h) {
        setVideoResolution(`${w}x${h}`);
      }
      setIsProcessingFile(false);
    };

    // Safety timeout: allow up to 3500ms for larger video files to read true duration
    const timer = setTimeout(() => {
      finalize(20);
    }, 3500);

    tempVid.onloadedmetadata = () => {
      clearTimeout(timer);
      finalize(tempVid.duration, tempVid.videoWidth, tempVid.videoHeight);
    };

    tempVid.onerror = () => {
      clearTimeout(timer);
      finalize(20);
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processVideoFile(e.target.files[0]);
    }
    // Reset input so selecting the same file triggers change again
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processVideoFile(e.dataTransfer.files[0]);
    }
  };

  const handleSelectSample = (sampleUrl: string, sampleTitle: string, sampleGenre: string) => {
    setVideoUrl(sampleUrl);
    setProjectTitle(sampleTitle);
    setSelectedGenre(sampleGenre);
    setErrorMsg(null);
  };

  const handleStart = () => {
    const finalTitle = projectTitle.trim() || (uploadedFile ? uploadedFile.name : 'Untitled Video Clip');
    const finalDuration = videoDuration || 20;
    const isRealFile = activeTab === 'upload' && Boolean(uploadedFile);

    // Only generate demo segments if no real video file was uploaded
    const generatedSegments = isRealFile
      ? undefined
      : generateSegmentsForUploadedVideo(finalDuration, selectedGenre, selectedLeadVoice);

    onStartNewProject({
      title: finalTitle,
      genre: selectedGenre,
      leadVoiceId: selectedLeadVoice,
      videoFile: isRealFile && uploadedFile ? uploadedFile : undefined,
      videoBlobUrl: isRealFile && videoBlobUrl ? videoBlobUrl : undefined,
      videoUrl: activeTab === 'url' ? videoUrl : undefined,
      duration: finalDuration,
      customSegments: generatedSegments
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Upload Video for Khmer Dubbing
            </h3>
            <p className="text-xs text-slate-400 font-kantumruy">
              បញ្ចូលវីដេអូសម្រាប់ដាក់សំឡេងខ្មែរ (Select File or Paste Link)
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'upload' ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload Video File (MP4, MOV, WebM)</span>
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'url' ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Paste Link (yt-dlp)</span>
          </button>
        </div>

        {/* Hidden Native File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.3gp,.ts,.wmv,.flv,audio/*"
          className="hidden"
        />

        {errorMsg && (
          <div className="p-3 mb-3 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4 text-xs">
          {activeTab === 'upload' ? (
            /* Direct File Upload Drop Zone */
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Select Movie / Video Clip
              </label>

              {!uploadedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
                      : 'border-slate-700 hover:border-amber-500/50 bg-slate-950/60 hover:bg-slate-950'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <span className="text-white font-bold block text-sm">
                    Click to browse or drag & drop video here
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Supports MP4, MOV, WebM, MKV (Up to 500 MB)
                  </span>
                  <span className="inline-block mt-3 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700">
                    Browse File on Device
                  </span>
                </div>
              ) : (
                /* Uploaded File Confirmation Card */
                <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                        <FileVideo className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs line-clamp-1">
                            {uploadedFile.name}
                          </span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>{(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                          <span>•</span>
                          <span>{videoDuration.toFixed(1)}s duration</span>
                          <span>•</span>
                          <span>{videoResolution}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                    >
                      Change
                    </button>
                  </div>

                  {/* Inline Video Preview Player */}
                  {videoBlobUrl && (
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-44 border border-slate-800">
                      <video
                        src={videoBlobUrl}
                        controls
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* URL / yt-dlp Tab */
            <div className="space-y-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Video URL (YouTube, TikTok, Facebook Reel, MP4 URL)
                </label>
                <input
                  type="text"
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-[11px] focus:outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  yt-dlp will extract video and split original dialogue from background music.
                </span>
              </div>

              {/* Quick sample clips */}
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  Or test with sample video trailers:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectSample('https://www.youtube.com/watch?v=sample-angkor-action', 'Angkor Raiders: The Lost Temple', 'action')}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition-colors"
                  >
                    <span className="font-bold text-white text-[11px] block truncate">Angkor Action</span>
                    <span className="text-[9px] text-slate-500">Action 4K</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSample('https://www.youtube.com/watch?v=sample-royal-drama', 'The Royal Silk Legacy', 'drama')}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition-colors"
                  >
                    <span className="font-bold text-white text-[11px] block truncate">Royal Drama</span>
                    <span className="text-[9px] text-slate-500">Emotional</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSample('https://www.youtube.com/watch?v=sample-cyber-scifi', 'Neo-Phnom Penh 2099', 'scifi')}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition-colors"
                  >
                    <span className="font-bold text-white text-[11px] block truncate">Cyberpunk 2099</span>
                    <span className="text-[9px] text-slate-500">Sci-Fi</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Project Title */}
          <div>
            <label className="text-slate-300 font-semibold block mb-1">
              Project Title
            </label>
            <input
              type="text"
              value={projectTitle}
              onChange={e => setProjectTitle(e.target.value)}
              placeholder="e.g., Gladiator Khmer Dub Scene 1"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Genre & Tone */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Cinematic Tone
              </label>
              <select
                value={selectedGenre}
                onChange={e => setSelectedGenre(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none"
              >
                <option value="action">Action / Intense (សកម្មភាព)</option>
                <option value="drama">Emotional Drama (មនោសញ្ចេតនា)</option>
                <option value="scifi">Sci-Fi / Futuristic (អនាគត)</option>
                <option value="comedy">Comedy / Lively (កំប្លែង)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Lead Khmer Voice
              </label>
              <select
                value={selectedLeadVoice}
                onChange={e => setSelectedLeadVoice(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none"
              >
                <option value="piseth">Piseth (Male Lead ពិសិដ្ឋ)</option>
                <option value="sreymom">Sreymom (Female Lead ស្រីមុំ)</option>
                <option value="borey">Borey (Narrator បុរី)</option>
                <option value="kolab">Kolab (Soft Storyteller កុលាប)</option>
                <option value="kiri">Kiri (Gritty Antagonist គិរី)</option>
                <option value="dara">Dara (Youthful Casual ដារា)</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleStart}
              disabled={activeTab === 'upload' && !uploadedFile && !projectTitle}
              className={`w-full py-3 rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === 'upload' && !uploadedFile && !projectTitle
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 shadow-amber-500/20 cursor-pointer'
              }`}
            >
              <span>Start Dubbing & AI Transcribe</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
