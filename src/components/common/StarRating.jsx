import { useState } from 'react';
import { Star } from 'lucide-react';

// Two modes in one component: pass `value` + `onChange` for an interactive 1-5 picker
// (rating submission forms), or just `value` alone for a read-only display (rounded to the
// nearest whole star — average ratings are fractional, but a half-filled star icon isn't
// worth the extra complexity for a prototype).
export default function StarRating({ value = 0, onChange, size = 18, count = 5 }) {
  const [hovered, setHovered] = useState(0);
  const isInteractive = Boolean(onChange);
  const displayValue = isInteractive && hovered ? hovered : Math.round(value);

  return (
    <span className={`star-rating ${isInteractive ? 'interactive' : ''}`} role={isInteractive ? 'radiogroup' : undefined}>
      {Array.from({ length: count }, (_, index) => index + 1).map((star) => (
        <button
          key={star}
          type="button"
          className={`star-rating-star ${star <= displayValue ? 'filled' : ''}`}
          disabled={!isInteractive}
          onClick={isInteractive ? () => onChange(star) : undefined}
          onMouseEnter={isInteractive ? () => setHovered(star) : undefined}
          onMouseLeave={isInteractive ? () => setHovered(0) : undefined}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
        >
          <Star size={size} />
        </button>
      ))}
    </span>
  );
}
