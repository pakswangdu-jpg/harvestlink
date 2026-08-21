import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { FarmerDirectoryCard, FarmerDirectoryCardSkeleton } from './FarmerDirectoryCard';
import { getTopRatedFarmers } from '../../services/authService';

// Testimonial-strip style autoplay, no manual UI — every ~4s, mid the 3.5-4s range asked for.
const AUTOPLAY_DELAY_MS = 4000;
// A wheel gesture fires many small 'wheel' events per physical scroll — this throttle turns
// that stream into one slide advance per gesture instead of racing through several slides.
const WHEEL_THROTTLE_MS = 350;

// Mobile (<768px) = 1 card with ~15% of the next one peeking in as a "there's more" affordance,
// tablet (768-1023px) = 2, laptop (1024-1439px) = 3, desktop (1440px+) = 4. 1440 isn't one of
// Tailwind's default breakpoints, hence the arbitrary min-[1440px] variant. Controls "cards
// visible" declaratively via slide width, the standard Embla pattern (Embla itself has no
// built-in "slides per view" option).
const SLIDE_CLASSNAME = 'min-w-0 shrink-0 grow-0 basis-[85%] px-3 md:basis-1/2 lg:basis-1/3 min-[1440px]:basis-1/4';

// Entrance stagger only makes sense for the cards visible on first paint (the brief specifies
// delays for cards 1-4); capping it means farmer #20 in a long list doesn't inherit an
// ever-growing, pointless delay.
const MAX_STAGGER_INDEX = 3;
const STAGGER_STEP_S = 0.1;

export default function TopRatedFarmersCarousel() {
  const [farmers, setFarmers] = useState(null);
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef(null);
  const hasEnteredView = useInView(sectionRef, { once: true, amount: 0.15 });
  // Lazy useState initializer (not a ref read during render) — still only constructs the
  // Autoplay plugin instance once per mount, which is what useEmblaCarousel needs a stable
  // plugins array for. stopOnInteraction: false is what makes a manual swipe/drag resume
  // autoplay on its own afterwards (rather than killing it for the rest of the session) — the
  // plugin resets its full delay on pointerUp, so the next auto-advance still lands a few
  // seconds later rather than immediately.
  const [autoplayPlugins] = useState(() => [
    Autoplay({ delay: AUTOPLAY_DELAY_MS, stopOnMouseEnter: true, stopOnInteraction: false }),
  ]);
  // duration bumped up from Embla's default (25) for a slower, more graceful glide between
  // slides instead of a quick snap — the closest lever Embla exposes to a longer, smoother
  // ease, since its scroll is physics-driven rather than a literal CSS transition.
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'start', skipSnaps: false, duration: 30 },
    autoplayPlugins,
  );
  const lastWheelAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getTopRatedFarmers()
      .then((result) => { if (!cancelled) setFarmers(result); })
      .catch(() => { if (!cancelled) setFarmers([]); });
    return () => {
      cancelled = true;
    };
  }, []);

  // Respect the user's OS-level motion preference by disabling autoplay outright rather than
  // just shortening transitions — a carousel that keeps moving on its own is exactly the kind
  // of motion this setting exists to suppress.
  useEffect(() => {
    if (!emblaApi || !prefersReducedMotion) return;
    const autoplay = emblaApi.plugins()?.autoplay;
    autoplay?.stop();
  }, [emblaApi, prefersReducedMotion]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Horizontal (or shift+vertical trackpad) wheel gestures nudge the carousel — throttled to
  // one slide per gesture so a single scroll doesn't blow through several cards at once. Not a
  // visible control, just an extra input path alongside drag/swipe.
  const handleWheel = useCallback((event) => {
    if (!emblaApi) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 15) return;
    const now = Date.now();
    if (now - lastWheelAtRef.current < WHEEL_THROTTLE_MS) return;
    lastWheelAtRef.current = now;
    if (delta > 0) emblaApi.scrollNext();
    else emblaApi.scrollPrev();
  }, [emblaApi]);

  // Keyboard equivalent of drag/swipe for a focusable region with no visible buttons — arrow
  // keys are the standard way a keyboard-only user drives a carousel that has none.
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrollNext();
    }
  }, [scrollPrev, scrollNext]);

  const isLoading = farmers === null;
  const isEmpty = farmers !== null && farmers.length === 0;
  // Skeletons render as their own single-page "carousel" (no real embla instance needed) —
  // four is enough to fill the widest (1440px+, 4-up) breakpoint without a layout shift once
  // real cards swap in.
  const skeletonCount = 4;

  const slides = useMemo(() => (isLoading
    ? Array.from({ length: skeletonCount }, (_, index) => ({ id: `skeleton-${index}`, skeleton: true }))
    : farmers), [isLoading, farmers]);

  const entranceInitial = prefersReducedMotion ? false : { opacity: 0, y: 40 };
  const entranceAnimate = !prefersReducedMotion && hasEnteredView ? { opacity: 1, y: 0 } : undefined;

  return (
    <section ref={sectionRef} className="w-full bg-[var(--soft)] py-16">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10">
        <motion.div
          initial={entranceInitial}
          animate={entranceAnimate}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="mx-auto mb-10 max-w-2xl text-center"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--green-700)]">Trusted by Buyers</p>
          <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-tight text-[var(--text)] sm:text-3xl">Top-rated Farmers</h2>
          <p className="mt-3 text-[15px] leading-6 text-[var(--muted)]">
            Meet our highest-rated verified farmers who consistently provide quality agricultural products.
          </p>
        </motion.div>

        {isEmpty ? (
          <p className="py-10 text-center text-sm font-medium text-[var(--muted)]">No top-rated farmers available yet.</p>
        ) : (
          <div
            className="relative"
            role="region"
            aria-roledescription="carousel"
            aria-label="Top-rated farmers"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="embla-viewport overflow-hidden" ref={emblaRef} onWheel={handleWheel}>
              {/* select-none stops a mouse-drag gesture from also triggering the browser's
                  native text selection (which was highlighting card text blue mid-drag) —
                  Embla's own drag handling covers the actual scrolling. */}
              <div className={`flex select-none ${isLoading ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}>
                {slides.map((farmer, index) => (
                  <div key={farmer.id} className={SLIDE_CLASSNAME} aria-hidden={farmer.skeleton ? 'true' : undefined}>
                    <motion.div
                      initial={entranceInitial}
                      animate={entranceAnimate}
                      transition={{ duration: 0.7, ease: 'easeOut', delay: Math.min(index, MAX_STAGGER_INDEX) * STAGGER_STEP_S }}
                      className="h-full"
                    >
                      {farmer.skeleton ? <FarmerDirectoryCardSkeleton /> : <FarmerDirectoryCard farmer={farmer} />}
                    </motion.div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
