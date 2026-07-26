import { useEffect, useRef, useState } from 'react';

// Minimal trigger+menu dropdown — kept generic (renders whatever `items` describe) so any
// page needing a compact action menu reuses this instead of hand-rolling another one.
export default function Dropdown({ trigger, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((current) => !current)} className="border-0 bg-transparent p-0">
        {trigger}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-[#D0D7DE] bg-white py-1 shadow-md">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => { item.onClick(); setOpen(false); }}
              className={`flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-[13px] hover:bg-[#F6F8FA] ${item.danger ? 'text-[#CF222E]' : 'text-[#24292F]'}`}
            >
              {item.icon ? <item.icon size={14} /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
