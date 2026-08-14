import { createElement } from 'react';

// SidebarNavItem (and AppShell's mobile bottom nav) render whatever's passed as a nav item's
// `icon` the same way they'd render a lucide component (`<Icon size={20} strokeWidth={2}
// className={...} />`) — this factory returns a component matching that same interface for a
// plain <img>, via createElement (not JSX) since the *Nav.js files that use it aren't .jsx
// modules. It won't recolor on hover/active like the lucide icons around it do (a raster PNG
// can't follow currentColor), but the active pill's green background/left accent bar already
// carries that state on their own.
export function createImageNavIcon(src) {
  return function ImageNavIcon({ size = 20, className }) {
    return createElement('img', {
      src, alt: '', width: size, height: size, className, style: { objectFit: 'contain' },
    });
  };
}
