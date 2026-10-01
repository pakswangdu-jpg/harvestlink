import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { FarmerDirectoryCard, FarmerDirectoryCardSkeleton } from './FarmerDirectoryCard';
import { getTopRatedFarmers } from '../../services/authService';


const AUTOPLAY_DELAY_MS = 4000;


const WHEEL_THROTTLE_MS = 350;






const SLIDE_CLASSNAME = 'min-w-0 shrink-0 grow-0 basis-[85%] px-3 md:basis-1/2 lg:basis-1/3 min-[1440px]:basis-1/4';




const MAX_STAGGER_INDEX = 3;
const STAGGER_STEP_S = 0.1;

export default function TopRatedFarmersCarousel() {
  const [farmers, setFarmers] = useState(null);
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef(null);
  const hasEnteredView = useInView(sectionRef, { once: true, amount: 0.15 });






  const [autoplayPlugins] = useState(() => [
    Autoplay({ delay: AUTOPLAY_DELAY_MS, stopOnMouseEnter: true, stopOnInteraction: false }),
  ]);



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




  useEffect(() => {
    if (!emblaApi || !prefersReducedMotion) return;
    const autoplay = emblaApi.plugins()?.autoplay;
    autoplay?.stop();
  }, [emblaApi, prefersReducedMotion]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);




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
              {

                                                                           }
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
