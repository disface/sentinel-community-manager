import React, { useState } from 'react';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker?: (stickerId: number) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    id: 'smiles',
    name: 'Эмоции',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
      '😏', '😒', '🙄', '😬', '🤥', '😔', '🤤', '😴', '😷', '🤒',
      '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '🥺', '😈', '👻', '💀',
    ],
  },
  {
    id: 'gestures',
    name: 'Жесты',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '✋',
      '🖐️', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
      '🙏', '💪', '👈', '👉', '👆', '👇', '☝️', '✍️', '💅', '🤳',
    ],
  },
  {
    id: 'symbols',
    name: 'Символы',
    emojis: [
      '🔥', '⚡', '⭐', '🌟', '💥', '💯', '❤️', '🖤', '🤍', '🤎',
      '💜', '💙', '💚', '💛', '🧡', '💔', '💖', '💣', '🚀', '🎯',
      '🏆', '🥇', '🥈', '🥉', '📌', '📍', '💬', '💭', '✔️', '❌',
    ],
  },
];

const STICKER_PACKS = [
  {
    id: 'spotty',
    name: 'Спотти',
    avatar: 'https://vk.com/sticker/1-1-128b.png',
    stickers: Array.from({ length: 32 }, (_, i) => 1 + i),
  },
  {
    id: 'peach',
    name: 'Персик',
    avatar: 'https://vk.com/sticker/1-49-128b.png',
    stickers: Array.from({ length: 32 }, (_, i) => 49 + i),
  },
  {
    id: 'senya',
    name: 'Сеня',
    avatar: 'https://vk.com/sticker/1-9008-128b.png',
    stickers: Array.from({ length: 25 }, (_, i) => 9008 + i),
  },
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji, onSelectSticker, onClose }) => {
  const [mainMode, setMainMode] = useState<'emoji' | 'stickers'>('emoji');
  const [activeCategory, setActiveCategory] = useState('smiles');
  const [activeStickerPack, setActiveStickerPack] = useState('spotty');

  const currentCategory = EMOJI_CATEGORIES.find((c) => c.id === activeCategory) || EMOJI_CATEGORIES[0];
  const currentStickerPack = STICKER_PACKS.find((p) => p.id === activeStickerPack) || STICKER_PACKS[0];

  return (
    <div className="absolute bottom-16 left-4 z-50 bg-surface-900 border border-surface-700 rounded-2xl p-3 shadow-2xl w-80 flex flex-col gap-2.5 backdrop-blur-md select-none animate-fadeIn">
      {/* Шапка: переключение режимов Эмодзи / Стикеры */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-800">
        <div className="flex items-center gap-1 bg-surface-950 p-0.5 rounded-xl border border-surface-800">
          <button
            onClick={() => setMainMode('emoji')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              mainMode === 'emoji' ? 'bg-accent text-white shadow-sm' : 'text-surface-400 hover:text-white'
            }`}
          >
            <span>Эмодзи</span>
          </button>
          <button
            onClick={() => setMainMode('stickers')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              mainMode === 'stickers' ? 'bg-accent text-white shadow-sm' : 'text-surface-400 hover:text-white'
            }`}
          >
            <span>Стикеры</span>
          </button>
        </div>

        <button onClick={onClose} className="p-1 hover:bg-surface-800 text-surface-400 hover:text-white rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {mainMode === 'emoji' ? (
        <>
          {/* Категории эмодзи */}
          <div className="flex items-center gap-1 bg-surface-950 p-1 rounded-xl border border-surface-800">
            {EMOJI_CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
                    isSelected ? 'bg-accent text-white shadow-sm font-semibold' : 'text-surface-400 hover:text-white'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* Сетка эмодзи */}
          <div className="grid grid-cols-7 gap-1 max-h-52 overflow-y-auto p-1">
            {currentCategory.emojis.map((emoji, idx) => (
              <button
                key={idx}
                onClick={() => onSelectEmoji(emoji)}
                className="w-8 h-8 rounded-lg hover:bg-surface-800 flex items-center justify-center text-lg transition-transform hover:scale-125 active:scale-95 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Вкладки наборов стикеров */}
          <div className="flex items-center gap-1 bg-surface-950 p-1 rounded-xl border border-surface-800 overflow-x-auto">
            {STICKER_PACKS.map((pack) => {
              const isSelected = activeStickerPack === pack.id;
              return (
                <button
                  key={pack.id}
                  onClick={() => setActiveStickerPack(pack.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    isSelected ? 'bg-accent text-white shadow-sm font-semibold' : 'text-surface-400 hover:text-white'
                  }`}
                >
                  <img src={pack.avatar} alt={pack.name} className="w-4 h-4 object-contain" />
                  <span>{pack.name}</span>
                </button>
              );
            })}
          </div>

          {/* Сетка стикеров */}
          <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
            {currentStickerPack.stickers.map((id) => (
              <button
                key={id}
                onClick={() => {
                  if (onSelectSticker) onSelectSticker(id);
                  onClose();
                }}
                className="p-1.5 rounded-xl hover:bg-surface-800 border border-transparent hover:border-surface-700 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer"
                title={`Отправить стикер #${id}`}
              >
                <img
                  src={`https://vk.com/sticker/1-${id}-128b.png`}
                  alt={`Стикер ${id}`}
                  loading="lazy"
                  className="w-14 h-14 object-contain pointer-events-none"
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
