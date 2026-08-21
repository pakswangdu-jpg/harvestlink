import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

// A compact, curated grid rather than a full Unicode emoji library — keeps this dependency-
// free (no new package) while covering what a marketplace chat actually needs: reactions,
// farm/produce, and everyday chat emoji.
const EMOJI_GROUPS = [
  { label: 'Frequently used', emoji: ['👍', '🙏', '😊', '😂', '❤️', '🔥', '👌', '🎉'] },
  { label: 'Farm & produce', emoji: ['🌾', '🥬', '🍅', '🥕', '🌽', '🍌', '🥭', '🍉', '🐓', '🚜'] },
  { label: 'Faces', emoji: ['😀', '😁', '😍', '🥰', '😅', '😢', '😮', '🤔', '😴', '🙌'] },
  { label: 'Chat', emoji: ['✅', '❌', '⏰', '📍', '🚚', '💰', '📦', '⭐'] },
];

export default function EmojiPicker({ onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-elevated)] p-3 shadow-xl z-20"
    >
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="mb-2 last:mb-0">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{group.label}</p>
          <div className="mt-1 grid grid-cols-8 gap-0.5">
            {group.emoji.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelect(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-lg transition-colors duration-150 hover:bg-[var(--green-50)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
}
