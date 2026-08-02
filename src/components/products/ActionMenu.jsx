import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EllipsisVertical } from 'lucide-react';

const MENU_WIDTH = 208; // w-52
const VIEWPORT_MARGIN = 8;

// `items` is an ordered list of { label, icon, onClick, danger, dividerBefore, hidden }.
//
// Rendered through a portal into document.body, positioned with `fixed` coordinates computed
// from the trigger button's own bounding rect — not a plain `absolute` child of the button.
// ProductTable.jsx's rows live inside .table-wrap, which sets overflow-x: auto; per the CSS
// overflow spec, a container with only one axis set to something other than visible forces
// the OTHER axis to behave as auto too, so that table was silently clipping this menu
// vertically as well — a row near the bottom needed the whole table scrolled to see the
// dropdown. A portal escapes that ancestor entirely. Flips above the button (and clamps
// horizontally) when there isn't enough room below/right, measured after the menu actually
// mounts so the flip is based on its real height, not a guess.
export default function ActionMenu({ items }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const visibleItems = items.filter((item) => !item.hidden);

  const openMenu = () => {
    const rect = buttonRef.current.getBoundingClientRect();
    // Provisional — flush against the button, refined once the menu's real height is known.
    setPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setIsOpen(true);
  };

  // Runs after the menu mounts but before the browser paints, so any flip/clamp below is
  // invisible to the user — never a visible jump from "below" to "above."
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !menuRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();

    const fitsBelow = buttonRect.bottom + 6 + menuRect.height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow
      ? buttonRect.bottom + 6
      : Math.max(VIEWPORT_MARGIN, buttonRect.top - 6 - menuRect.height);

    const right = Math.max(VIEWPORT_MARGIN, Math.min(window.innerWidth - buttonRect.right, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN));

    setPosition((previous) => (previous?.top === top && previous?.right === right ? previous : { top, right }));
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    // A scroll anywhere (the table's own overflow-x: auto container included) invalidates the
    // fixed coordinates computed above — closing is simpler and more predictable than
    // continuously re-tracking the button's position while scrolling.
    const handleScroll = () => setIsOpen(false);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Row actions"
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900"
      >
        <EllipsisVertical size={18} strokeWidth={2} />
      </button>

      {isOpen && position ? createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: position.top, right: position.right, width: MENU_WIDTH }}
          className="z-50 overflow-hidden rounded-xl border border-gray-100 bg-white py-1.5 shadow-lg"
        >
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
        </div>,
        document.body,
      ) : null}
    </>
  );
}
