import React, { useState } from 'react';
import { 
  X, Check, Copy, Terminal, Sliders, Zap, Volume2, 
  ExternalLink, Sparkles, BookOpen, Film, Mic, Music
} from 'lucide-react';
import { khmerSynthesizer } from '../utils/khmerTts.ts';

interface NiceOneDubberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NiceOneDubberModal: React.FC<NiceOneDubberModalProps> = ({
  isOpen,
  onClose
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testText, setTestText] = useState('ថ្ងៃនេះអញនឹងធ្វើឲ្យឯងស្លាប់មិនសល់សាកសព!');
  const [activeAudition, setActiveAudition] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handlePlayTunedSample = async (voiceId: string, text: string, rate: number, label: string) => {
    khmerSynthesizer.unlockAudio();
    setActiveAudition(label);
    await khmerSynthesizer.speak(text, voiceId, rate);
    setTimeout(() => {
      setActiveAudition(null);
    }, 3500);
  };

  const warriorCmd = `edge-tts --voice km-KH-PisethNeural --rate=+35% --pitch=-8Hz --text "ថ្ងៃនេះអញនឹងធ្វើឲ្យឯងស្លាប់មិនសល់សាកសព!" --write-media male_dub.mp3`;
  const fighterCmd = `edge-tts --voice km-KH-SreymomNeural --rate=+30% --pitch=+5Hz --text "ទទួលមួយកណ្ដាប់ដៃឯង?" --write-media female_dub.mp3`;
  const recapCmd = `edge-tts --voice km-KH-PisethNeural --rate=+20% --pitch=-3Hz --text "នៅក្នុងឈុតឆាកនេះ តួឯករបស់យើងក៏បានរកឃើញការពិតដែលលាក់ទុក។" --write-media recap_dub.mp3`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20">
              <Zap className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span className="font-kantumruy text-amber-400">Nice One Dubber & PyVideoTrans AI Workflow</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                  Microsoft Neural + Gemini
                </span>
              </div>
              <p className="text-xs text-slate-400">
                របៀបបង្កើត និង Tune សំឡេង AI សម្រាយរឿង និង បញ្ចូលសំឡេងភាពយន្តខ្មែរ (km-KH-PisethNeural & km-KH-SreymomNeural)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 text-xs text-slate-300">
          {/* Quick Audition Bar */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-950/30 via-slate-950 to-slate-950 border border-amber-500/30 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm text-white font-kantumruy">
                  សាកល្បងសំឡេង Movie Dubbing Tuned ផ្ទាល់ (Live Audition):
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Tuned with Microsoft Edge TTS + Pitch/Rate Offsets
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => handlePlayTunedSample('piseth', 'ថ្ងៃនេះអញនឹងធ្វើឲ្យឯងស្លាប់មិនសល់សាកសព!', 1.35, 'warrior')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activeAudition === 'warrior'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-500/30'
                    : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold font-kantumruy">តួប្រុសចាស់ / មេទ័ព</span>
                  <span className="font-mono text-[10px] opacity-80">-8Hz • +35%</span>
                </div>
                <span className="text-[11px] opacity-90 font-kantumruy mt-1 line-clamp-1">
                  "ថ្ងៃនេះអញនឹងធ្វើឲ្យឯងស្លាប់មិនសល់សាកសព!"
                </span>
                <span className="text-[10px] text-amber-300 mt-2 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  <span>{activeAudition === 'warrior' ? 'កំពុងនិយាយ...' : 'Play Sample (Piseth)'}</span>
                </span>
              </button>

              <button
                onClick={() => handlePlayTunedSample('sreymom', 'ទទួលមួយកណ្ដាប់ដៃឯង?', 1.30, 'fighter')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activeAudition === 'fighter'
                    ? 'bg-rose-500 text-white border-rose-400 font-bold shadow-md shadow-rose-500/30'
                    : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold font-kantumruy">តួស្រីកាច / ក្បាច់គុន</span>
                  <span className="font-mono text-[10px] opacity-80">+5Hz • +30%</span>
                </div>
                <span className="text-[11px] opacity-90 font-kantumruy mt-1 line-clamp-1">
                  "ទទួលមួយកណ្ដាប់ដៃឯង?"
                </span>
                <span className="text-[10px] text-rose-300 mt-2 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  <span>{activeAudition === 'fighter' ? 'កំពុងនិយាយ...' : 'Play Sample (Sreymom)'}</span>
                </span>
              </button>

              <button
                onClick={() => handlePlayTunedSample('sovann', 'នៅក្នុងឈុតឆាកនេះ តួឯករបស់យើងក៏បានរកឃើញការពិតដែលលាក់ទុក។', 1.20, 'recap')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activeAudition === 'recap'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-md shadow-emerald-500/30'
                    : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold font-kantumruy">សម្រាយរឿង AI ខ្មែរ</span>
                  <span className="font-mono text-[10px] opacity-80">-3Hz • +20%</span>
                </div>
                <span className="text-[11px] opacity-90 font-kantumruy mt-1 line-clamp-1">
                  "នៅក្នុងឈុតឆាកនេះ តួឯករបស់យើងក៏បានរកឃើញ..."
                </span>
                <span className="text-[10px] text-emerald-300 mt-2 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  <span>{activeAudition === 'recap' ? 'កំពុងនិយាយ...' : 'Play Sample (Recap)'}</span>
                </span>
              </button>
            </div>
          </div>

          {/* 1. The AI Models Used in the Video */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <span className="w-5 h-5 rounded-md bg-amber-500 text-slate-950 font-mono flex items-center justify-center text-xs">1</span>
              <span>The AI Models Used in Movie Dubbing (Nice One Dubber App)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-amber-400" />
                  <span>Text-to-Speech: Microsoft Neural Voices</span>
                </span>
                <ul className="space-y-1.5 text-slate-300">
                  <li>• <strong className="text-white">Male Voice:</strong> <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">km-KH-PisethNeural</code></li>
                  <li>• <strong className="text-white">Female Voice:</strong> <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">km-KH-SreymomNeural</code></li>
                  <li className="text-[11px] text-slate-400 pt-1">
                    *(Note: Open-source VoxCPM2 48kHz Khmer LoRA is also available for offline PC studio cloning).*
                  </li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>Transcription & Translation: Google Gemini</span>
                </span>
                <p className="text-slate-300 leading-relaxed">
                  Uses Google Gemini (<code className="text-sky-300 bg-slate-900 px-1 py-0.5 rounded">gemini-3.1-flash-lite</code> & <code className="text-sky-300 bg-slate-900 px-1 py-0.5 rounded">gemini-3.8-flash</code>) with a free API key from <em>aistudio.google.com</em>. Gemini transcribes original Chinese/English speech, identifies actors, and translates lines into dramatic, movie-style Khmer script.
                </p>
              </div>
            </div>
          </div>

          {/* 2. How the Voice Is "Tuned" for Movie Dubbing */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <span className="w-5 h-5 rounded-md bg-amber-500 text-slate-950 font-mono flex items-center justify-center text-xs">2</span>
              <span>How the Voice Is "Tuned" for Movie Dubbing</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" /> Character Pitch & Rate
                </span>
                <p className="text-[11px] text-slate-300">
                  Because Microsoft provides 1 male and 1 female Khmer voice, character profiles (old vs. young) are created by shifting the pitch (lower Hz for older warriors, higher for young heroes) and adjusting base speech rate.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <span className="font-bold text-amber-400 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> Dynamic Speed-Up (Auto-Fit)
                </span>
                <p className="text-[11px] text-slate-300">
                  Khmer takes longer to pronounce than Chinese/English. The app sets <strong>"Speed up to fit" to 1.80x</strong> and displays <strong>"Auto-fit: 20 rushed lines"</strong> so speech finishes inside the actor's lip movements.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <span className="font-bold text-rose-400 flex items-center gap-1">
                  <Music className="w-3.5 h-3.5" /> Keep Audio Underneath (Ducking)
                </span>
                <p className="text-[11px] text-slate-300">
                  Keeps the original background music, sword clashes, and punches, while automatically lowering ("ducking") the original voice volume whenever the Khmer TTS voice speaks.
                </p>
              </div>
            </div>

            {/* Character Tuning Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/80">
                    <th className="p-2.5">Character Archetype</th>
                    <th className="p-2.5">Base Microsoft Voice</th>
                    <th className="p-2.5">Pitch Offset</th>
                    <th className="p-2.5">Rate Offset</th>
                    <th className="p-2.5">Dubbing Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  <tr>
                    <td className="p-2.5 font-bold text-white font-kantumruy">Older / Deep Warrior (Piseth)</td>
                    <td className="p-2.5 text-amber-300">km-KH-PisethNeural</td>
                    <td className="p-2.5 text-emerald-400 font-bold">-8Hz</td>
                    <td className="p-2.5 text-amber-400 font-bold">+35%</td>
                    <td className="p-2.5 text-slate-400 font-sans">Commanding general, older hero</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-white font-kantumruy">Fierce Fighter (Sreymom)</td>
                    <td className="p-2.5 text-rose-300">km-KH-SreymomNeural</td>
                    <td className="p-2.5 text-emerald-400 font-bold">+5Hz</td>
                    <td className="p-2.5 text-amber-400 font-bold">+30%</td>
                    <td className="p-2.5 text-slate-400 font-sans">Martial arts female fighter</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-white font-kantumruy">Movie Recap Narrator</td>
                    <td className="p-2.5 text-amber-300">km-KH-PisethNeural</td>
                    <td className="p-2.5 text-emerald-400 font-bold">-3Hz</td>
                    <td className="p-2.5 text-amber-400 font-bold">+20%</td>
                    <td className="p-2.5 text-slate-400 font-sans">Cambodia AI movie recap (សម្រាយរឿង)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-white font-kantumruy">Dark Villain / Warlord</td>
                    <td className="p-2.5 text-amber-300">km-KH-PisethNeural</td>
                    <td className="p-2.5 text-emerald-400 font-bold">-14Hz</td>
                    <td className="p-2.5 text-amber-400 font-bold">+15%</td>
                    <td className="p-2.5 text-slate-400 font-sans">Deep menacing antagonist</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-white font-kantumruy">Elder Master / Monk</td>
                    <td className="p-2.5 text-amber-300">km-KH-PisethNeural</td>
                    <td className="p-2.5 text-emerald-400 font-bold">-6Hz</td>
                    <td className="p-2.5 text-amber-400 font-bold">-5%</td>
                    <td className="p-2.5 text-slate-400 font-sans">Wise aged master</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-white font-kantumruy">Gentle Heroine / Princess</td>
                    <td className="p-2.5 text-rose-300">km-KH-SreymomNeural</td>
                    <td className="p-2.5 text-emerald-400 font-bold">+2Hz</td>
                    <td className="p-2.5 text-amber-400 font-bold">+10%</td>
                    <td className="p-2.5 text-slate-400 font-sans">Romantic female lead</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-white font-kantumruy">Young Hero / Scout</td>
                    <td className="p-2.5 text-amber-300">km-KH-PisethNeural</td>
                    <td className="p-2.5 text-emerald-400 font-bold">+4Hz</td>
                    <td className="p-2.5 text-amber-400 font-bold">+25%</td>
                    <td className="p-2.5 text-slate-400 font-sans">Energetic youthful hero</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Option A & Option B Workflow Guide */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <span className="w-5 h-5 rounded-md bg-amber-500 text-slate-950 font-mono flex items-center justify-center text-xs">3</span>
              <span>How to Get and Tune This Voice Yourself (Free CLI & Software)</span>
            </h4>

            {/* Option A: Python edge-tts */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Option A: Free edge-tts (Python / Command Line)</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-400">
                  100% Free • No Azure Key Required
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>1. Install edge-tts via Python:</span>
                    <button
                      onClick={() => handleCopy('pip install edge-tts', 'pip')}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      {copiedId === 'pip' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'pip' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-emerald-400 text-xs">
                    pip install edge-tts
                  </pre>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>2. Generate Older/Deep Male Warrior (Piseth: -8Hz pitch, +35% rate):</span>
                    <button
                      onClick={() => handleCopy(warriorCmd, 'warrior')}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      {copiedId === 'warrior' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'warrior' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-amber-300 text-xs overflow-x-auto">
                    {warriorCmd}
                  </pre>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>3. Generate Fast/Fierce Female Fighter (Sreymom: +5Hz pitch, +30% rate):</span>
                    <button
                      onClick={() => handleCopy(fighterCmd, 'fighter')}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      {copiedId === 'fighter' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'fighter' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-rose-300 text-xs overflow-x-auto">
                    {fighterCmd}
                  </pre>
                </div>
              </div>
            </div>

            {/* Option B: Automated Software */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-amber-400" />
                  <span>Nice One Dubber (App from Video)</span>
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Distributed via TikTok & Telegram channel (<strong>@niceonedubber2</strong>). Bundles Gemini API translation with Microsoft Edge TTS and automatic lip-sync speed-up.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <ExternalLink className="w-4 h-4 text-emerald-400" />
                  <span>PyVideoTrans (Free & Open-Source PC Alternative)</span>
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Free open-source PC tool on GitHub. Uses the exact same workflow: plug in free Google Gemini API key for translation, select Edge-TTS (<code className="text-amber-300">km-KH-PisethNeural</code> / <code className="text-amber-300">km-KH-SreymomNeural</code>), and enable <strong>Voice Auto-Acceleration</strong>!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            KhmerDub AI Studio incorporates this full pipeline directly into your browser!
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
          >
            Got It & Return to Studio
          </button>
        </div>
      </div>
    </div>
  );
};
