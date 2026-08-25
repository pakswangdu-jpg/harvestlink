import { createElement } from 'react';

// SidebarNavItem (and AppShell's mobile bottom nav) render whatever's passed as a nav item's
// `icon` the same way they'd render a lucide component (`<Icon size={20} strokeWidth={2}
// className={...} />`) — this factory returns a component matching that same interface for a
// supplied PNG, via createElement (not JSX) since the *Nav.js files that use it aren't .jsx
// modules.
//
// The artwork is applied as a CSS mask rather than painted directly: its alpha channel
// supplies the shape pixel-for-pixel unchanged, and currentColor fills it, so the icon picks
// up the same muted/active/dark-mode colors every lucide icon around it responds to. Painting
// the PNG itself would lock it to its baked-in black, which disappears against the dark-mode
// sidebar and could never turn green when active.
export function createMaskNavIcon(src) {
  return function MaskNavIcon({ size = 20, className }) {
    return createElement('span', {
      className,
      'aria-hidden': true,
      style: {
        display: 'inline-block',
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      },
    });
  };
}
