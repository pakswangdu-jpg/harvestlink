import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FarmerDirectoryCard, FarmerDirectoryCardSkeleton } from './FarmerDirectoryCard';
import { getTopRatedFarmers } from '../../services/authService';

const AUTOPLAY_DELAY_MS = 5000;
// A wheel gesture fires many small 'wheel' events per physical scroll — this throttle turns
// that stream into one slide advance per gesture instead of racing through several slides.
const WHEEL_THROTTLE_MS = 350;

// Mobile = 1 card, tablet (md, 768px+) = 2, desktop (lg, 1024px+) and up = 4 — 4 is the hard
// cap at every desktop size, not just up to some breakpoint (a wider "show 5" tier was tried
// and dropped: with the still-small number of verified farmers in most deployments, 5-per-view
// often has more slide slots than there are distinct cards to fill them, which looks broken
// rather than just sparse). Controls "cards visible" declaratively via slide width, the
// standard Embla pattern (Embla itself has no built-in "slides per view" option).
const SLIDE_CLASSNAME = 'min-w-0 shrink-0 grow-0 basis-full px-3 md:basis-1/2 lg:basis-1/4';

export default function TopRatedFarmersCarousel() {
  const [farmers, setFarmers] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState([]);
  // Lazy useState initializer (not a ref read during render) — still only constructs the
  // Autoplay plugin instance once per mount, which is what useEmblaCarousel needs a stable
  // plugins array for.
  const [autoplayPlugins] = useState(() => [
    Autoplay({ delay: AUTOPLAY_DELAY_MS, stopOnMouseEnter: true, stopOnInteraction: false }),
  ]);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start', skipSnaps: false }, autoplayPlugins);
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

  const onSelect = useCallback((api) => {
    setSelectedIndex(api.selectedScrollSnap());
  }, []);

  // Synchronizing React state with the embla instance's own internal state (current snap
  // list/selected index) the moment it's ready — a legitimate "sync with an external
  // system" effect, not derived state.
  useEffect(() => {
    if (!emblaApi) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScrollSnaps(emblaApi.scrollSnapList());
    onSelect(emblaApi);
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', (api) => {
      setScrollSnaps(api.scrollSnapList());
      onSelect(api);
    });
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index) => emblaApi?.scrollTo(index), [emblaApi]);

  // Horizontal (or shift+vertical trackpad) wheel gestures nudge the carousel — throttled to
  // one slide per gesture so a single scroll doesn't blow through several cards at once.
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
  // four is enough to fill the widest (lg+, 4-up) breakpoint without a layout shift once
  // real cards swap in.
  const skeletonCount = 4;

  const slides = useMemo(() => (isLoading
    ? Array.from({ length: skeletonCount }, (_, index) => ({ id: `skeleton-${index}`, skeleton: true }))
    : farmers), [isLoading, farmers]);

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-16 sm:px-6 lg:px-10">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-green-700">Trusted by Buyers</p>
        <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-tight text-gray-900 sm:text-3xl">Top-rated Farmers</h2>
        <p className="mt-3 text-[15px] leading-6 text-gray-500">
          Meet our highest-rated verified farmers who consistently provide quality agricultural products.
        </p>
      </div>

      {isEmpty ? (
        <p className="py-10 text-center text-sm font-medium text-gray-500">No top-rated farmers available yet.</p>
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
              {slides.map((farmer) => (
                <div key={farmer.id} className={SLIDE_CLASSNAME} aria-hidden={farmer.skeleton ? 'true' : undefined}>
                  {farmer.skeleton ? <FarmerDirectoryCardSkeleton /> : <FarmerDirectoryCard farmer={farmer} />}
                </div>
              ))}
            </div>
          </div>

          {!isLoading && farmers.length > 1 ? (
            <>
              <button
                type="button"
                onClick={scrollPrev}
                aria-label="Previous farmers"
                className="absolute left-0 top-1/2 z-10 hidden h-11 w-11 -translate-x-4 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg transition-colors hover:border-green-300 hover:text-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 sm:flex"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={scrollNext}
                aria-label="Next farmers"
                className="absolute right-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 translate-x-4 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg transition-colors hover:border-green-300 hover:text-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 sm:flex"
              >
                <ChevronRight size={20} />
              </button>
            </>
          ) : null}

          {!isLoading && scrollSnaps.length > 1 ? (
            <div className="mt-8 flex items-center justify-center gap-2">
              {scrollSnaps.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => scrollTo(index)}
                  aria-label={`Go to slide ${index + 1}`}
                  aria-current={index === selectedIndex ? 'true' : undefined}
                  className={`h-2 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${
                    index === selectedIndex ? 'w-6 bg-green-600' : 'w-2 bg-gray-200 hover:bg-gray-300'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
