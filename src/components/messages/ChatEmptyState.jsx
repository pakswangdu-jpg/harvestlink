import { motion } from 'framer-motion';
import { MessageCircle, MessagesSquare } from 'lucide-react';

// Shown inside an open (real, non-empty-inbox) thread that simply has no messages yet —
// distinct from ConversationList's own "no conversations at all" empty state.
export function StartConversationState({ name }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <motion.span
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
      >
        <MessageCircle size={28} strokeWidth={1.5} />
      </motion.span>
      <h3 className="text-[16px] font-bold text-gray-900">Start your conversation</h3>
      <p className="max-w-xs text-[13px] text-gray-500">
        {name ? `Ask ${name} about availability, delivery, or pricing.` : 'Ask about availability, delivery, or pricing.'}
      </p>
    </div>
  );
}

// Desktop-only: shown in the chat pane when no conversation is selected yet.
export function NoConversationSelectedState() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 px-6 text-center md:flex">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-gray-300">
        <MessagesSquare size={28} strokeWidth={1.5} />
      </span>
      <h3 className="text-[16px] font-bold text-gray-700">Your messages</h3>
      <p className="max-w-xs text-[13px] text-gray-400">Select a conversation to start chatting.</p>
    </div>
  );
}
