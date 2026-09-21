import { ListOrdered, X, Clock, ChevronRight } from 'lucide-react';
import { ScriptBlock } from '../types';
import { formatTime } from '../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  blocks: ScriptBlock[];
  activeLineIndex?: number;
  onSelectBlock: (block: ScriptBlock) => void;
}

export default function EscaletaDrawer({
  isOpen,
  onClose,
  blocks,
  activeLineIndex = 0,
  onSelectBlock
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#0C0D14]/95 backdrop-blur-md border-l border-gray-800 shadow-2xl flex flex-col text-white animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListOrdered className="text-amber-500" size={20} />
          <div>
            <h3 className="font-bold text-sm text-gray-100">Escaleta do Roteiro</h3>
            <p className="text-[11px] text-gray-400">{blocks.length} {blocks.length === 1 ? 'bloco' : 'blocos de gravação'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Block List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {blocks.map((block, idx) => {
          const isActive = activeLineIndex >= block.lineIndex && (
            idx === blocks.length - 1 || activeLineIndex < blocks[idx + 1].lineIndex
          );

          return (
            <div
              key={block.id}
              onClick={() => {
                onSelectBlock(block);
                onClose();
              }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-150 group ${
                isActive
                  ? 'bg-amber-500/10 border-amber-500/80 ring-1 ring-amber-500/50'
                  : 'bg-[#141520] border-gray-800/80 hover:border-gray-600 hover:bg-[#1A1B2A]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-black/40 text-amber-400">
                  BLOCO {idx + 1}
                </span>
                <div className="flex items-center gap-2 text-[11px] text-gray-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {formatTime(block.estimatedSeconds)}
                  </span>
                  <span>•</span>
                  <span>{block.wordCount} pal.</span>
                </div>
              </div>

              <h4 className="font-bold text-sm text-gray-200 group-hover:text-white mb-1 truncate">
                {block.title}
              </h4>

              <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                {block.content}
              </p>

              <div className="mt-2 flex items-center justify-end text-[11px] text-amber-400/80 group-hover:text-amber-400 font-medium">
                Pular para este bloco <ChevronRight size={13} className="ml-0.5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-gray-800 bg-black/40 text-xs text-gray-400 flex justify-between items-center">
        <span>Tempo Total Estimado:</span>
        <span className="font-mono font-bold text-amber-400">
          {formatTime(blocks.reduce((acc, b) => acc + b.estimatedSeconds, 0))}
        </span>
      </div>
    </div>
  );
}
