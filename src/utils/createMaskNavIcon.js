import { createElement } from 'react';












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
