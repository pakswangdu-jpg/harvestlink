import { motion } from 'framer-motion';

const dotTransition = (delay) => ({
  duration: 0.9,
  repeat: Infinity,
  ease: 'easeInOut',
  delay,
});

// Real — only ever rendered while the other party's browser is actually emitting typing
// events over the socket (see useChatTyping.js), never a simulated/decorative animation.
export default function TypingIndicator({ name }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="flex items-center gap-2 px-2 py-1"
    >
      <div className="flex items-center gap-1 rounded-3xl rounded-bl-lg border border-gray-100 bg-gray-100 px-4 py-3">
        {[0, 0.15, 0.3].map((delay) => (
          <motion.span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-gray-400"
            animate={{ y: ['0%', '-60%', '0%'] }}
            transition={dotTransition(delay)}
          />
        ))}
      </div>
      {name ? <span className="text-[12px] text-gray-400">{name} is typing…</span> : null}
    </motion.div>
  );
}
