import React from 'react';
import { Type, Palette, AlignVerticalDistributeCenter, Eye, Check } from 'lucide-react';
import { SubtitleStyleConfig } from './VideoPlayer.tsx';

interface SubtitleStylerProps {
  subtitleStyle: SubtitleStyleConfig;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyleConfig>>;
}

const FONTS = [
  { id: 'Kantumruy Pro', name: 'Kantumruy Pro (កន្ទុំរុយ)', desc: 'Modern, clean, highly legible cinematic subtitle standard' },
  { id: 'Battambang', name: 'Battambang (បាត់ដំបង)', desc: 'Classic bold typography, ideal for dramatic title cuts' },
  { id: 'Koulen', name: 'Koulen (គូលែន)', desc: 'Heavy impactful poster style for action & trailers' },
  { id: 'Siemreap', name: 'Siemreap (សៀមរាប)', desc: 'Organic curved elegance for historical & cultural films' },
];

const PRESET_COLORS = [
  { name: 'Pure White', text: '#FFFFFF', outline: '#000000' },
  { name: 'Cinema Gold', text: '#FFE600', outline: '#000000' },
  { name: 'Amber Glow', text: '#F59E0B', outline: '#1E1B4B' },
  { name: 'Neon Cyan', text: '#38BDF8', outline: '#020617' },
  { name: 'Emerald', text: '#34D399', outline: '#064E3B' },
];

export const SubtitleStyler: React.FC<SubtitleStylerProps> = ({
  subtitleStyle,
  setSubtitleStyle
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Type className="w-4 h-4 text-amber-400" />
          <span className="font-kantumruy">រចនាម៉ូដអក្សររត់ក្រោម (Subtitles)</span>
          <span className="text-slate-400 font-normal">| Khmer Caption Styler</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Customize Khmer typography, stroke outlines, and backdrops for burned-in video captions or exported SRT.
        </p>
      </div>

      {/* Live Preview Card */}
      <div className="relative rounded-xl overflow-hidden bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 p-8 flex items-center justify-center min-h-[140px]">
        <div className="absolute top-2 left-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
          <Eye className="w-3 h-3 text-amber-400" /> Live Cinema Caption Preview
        </div>
        <div 
          className="text-center max-w-[85%] transition-all"
          style={{
            fontFamily: subtitleStyle.fontFamily,
            fontSize: `${subtitleStyle.fontSize}px`,
            color: subtitleStyle.textColor,
            backgroundColor: subtitleStyle.backgroundBox 
              ? `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity})` 
              : 'transparent',
            padding: subtitleStyle.backgroundBox ? '8px 16px' : '0',
            borderRadius: '8px',
            textShadow: subtitleStyle.outlineWidth > 0 
              ? `-${subtitleStyle.outlineWidth}px -${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}, ${subtitleStyle.outlineWidth}px -${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}, -${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}, ${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px 0 ${subtitleStyle.outlineColor}`
              : 'none',
            lineHeight: 1.4
          }}
        >
          យើងត្រូវតែទម្លុះទ្វារប្រាសាទបុរាណនេះ មុនពេលព្រះអាទិត្យលិច!
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Font Family Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Khmer Font Family (ពុម្ពអក្សរខ្មែរ)
          </label>
          <div className="space-y-1.5">
            {FONTS.map(font => {
              const isSelected = subtitleStyle.fontFamily === font.id;
              return (
                <div
                  key={font.id}
                  onClick={() => setSubtitleStyle({ ...subtitleStyle, fontFamily: font.id as any })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected 
                      ? 'bg-amber-500/10 border-amber-500/50 text-white' 
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <span className="font-bold text-sm block" style={{ fontFamily: font.id }}>
                      {font.name}
                    </span>
                    <span className="text-[11px] text-slate-500">{font.desc}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Styling Adjusters */}
        <div className="space-y-4">
          {/* Color Presets */}
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
              Color Palette Preset
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => {
                const isSelected = subtitleStyle.textColor === c.text;
                return (
                  <button
                    key={c.name}
                    onClick={() => setSubtitleStyle({
                      ...subtitleStyle,
                      textColor: c.text,
                      outlineColor: c.outline
                    })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all ${
                      isSelected 
                        ? 'border-white bg-slate-800 text-white shadow-md' 
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full border border-black/40" style={{ backgroundColor: c.text }} />
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Font Size:</span>
              <span className="font-mono text-white">{subtitleStyle.fontSize}px</span>
            </div>
            <input
              type="range"
              min={16}
              max={40}
              value={subtitleStyle.fontSize}
              onChange={e => setSubtitleStyle({ ...subtitleStyle, fontSize: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Stroke Outline Width */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Black Stroke Outline (Legibility):</span>
              <span className="font-mono text-white">{subtitleStyle.outlineWidth}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={4}
              step={0.5}
              value={subtitleStyle.outlineWidth}
              onChange={e => setSubtitleStyle({ ...subtitleStyle, outlineWidth: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Background Box & Placement */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Background Box
              </label>
              <button
                onClick={() => setSubtitleStyle({ ...subtitleStyle, backgroundBox: !subtitleStyle.backgroundBox })}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                  subtitleStyle.backgroundBox 
                    ? 'bg-amber-500 text-slate-950 font-bold' 
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {subtitleStyle.backgroundBox ? 'Translucent Bar (ON)' : 'No Background (OFF)'}
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Vertical Position
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                {(['bottom', 'center', 'top'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => setSubtitleStyle({ ...subtitleStyle, position: pos })}
                    className={`py-1 rounded-lg capitalize font-medium transition-colors ${
                      subtitleStyle.position === pos 
                        ? 'bg-slate-800 text-amber-300 font-bold' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
