import { useEffect, useRef, useState } from 'react';
import { EllipsisVertical } from 'lucide-react';

// `items` is an ordered list of { label, icon, onClick, danger, dividerBefore, hidden }.
// Same click-outside-to-close pattern as NotificationBell.
export default function ActionMenu({ items }) {
  const wrapperRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const visibleItems = items.filter((item) => !item.hidden);

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        aria-label="Row actions"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900"
      >
        <EllipsisVertical size={18} strokeWidth={2} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white py-1.5 shadow-lg">
          {visibleItems.map((item, index) => (
            <div key={item.label}>
              {item.dividerBefore && index > 0 ? <div className="my-1.5 h-px bg-gray-100" /> : null}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2.5 border-0 bg-transparent px-3.5 py-2 text-left text-[14px] font-medium transition-colors duration-200 ${
                  item.danger ? 'text-red-700 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <item.icon size={16} strokeWidth={2} className="shrink-0" />
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
