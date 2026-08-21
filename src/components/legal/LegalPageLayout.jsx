import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logo from '../../assets/logo.png';

// Shared chrome for the Privacy Policy and Terms of Service pages — sticky branded header,
// a scrollspy table of contents, and the numbered-section content area. Both legal pages are
// pure content (see PrivacyPolicy.jsx / TermsOfService.jsx); everything structural lives
// here once instead of being duplicated across the two.
//
// `sections`: [{ id, title, content: ReactNode }] — content is raw JSX (headings inside it
// use h3, since this layout renders each entry's own h2). `intro` is optional JSX rendered
// between the title block and the first section (a short "what this document covers" lede).
export default function LegalPageLayout({ title, lastUpdated, intro, sections }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeId, setActiveId] = useState(sections[0]?.id);

  // Terms of Service / Privacy Policy can be opened from mid-flow (registration, checkout).
  // AuthPage.jsx links here same-tab on purpose (a target="_blank" tab doesn't inherit this
  // origin's sessionStorage without an opener relationship, which would silently disconnect
  // it from the registration draft saved there — see AuthPage.jsx's own comment on those
  // links). Browser history is still an unreliable "back" signal on its own even same-tab
  // (e.g. arriving via a hard navigation), so this always prefers an explicit destination.
  //
  // The reliable fix: whoever links here says explicitly where "back" means, via
  // ?returnTo=/register (see AuthPage.jsx) — this always wins once present. Only a visitor
  // who reached this page some other way (no returnTo at all — a bookmark, the footer, a
  // shared link) falls through to real browser history, and only failing that, home.
  const returnTo = searchParams.get('returnTo');
  const handleBack = () => {
    if (returnTo && returnTo.startsWith('/')) navigate(returnTo);
    else if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  useEffect(() => {
    const targets = sections.map((section) => document.getElementById(section.id)).filter(Boolean);
    if (!targets.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scrolls manually (rather than relying on the browser's default anchor jump) so the
  // sticky header's height is accounted for via scroll-margin-top on each <section>, and so
  // the URL hash updates without a hard jump for keyboard/reduced-motion users who still
  // benefit from a focus target.
  const handleTocClick = (event, id) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.pushState(null, '', `#${id}`);
    setActiveId(id);
    target.focus({ preventScroll: true });
  };

  return (
    <div className="min-h-screen bg-[var(--panel)] text-[var(--text)]">
      <a
        href="#legal-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--green-700)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur supports-[backdrop-filter]:bg-[var(--panel)]/75">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 text-[var(--text)]">
            <img src={logo} alt="" className="h-7 w-7 shrink-0" />
            <span className="truncate text-[15px] font-bold tracking-tight">HarvestLink</span>
          </Link>
          <p className="hidden truncate text-sm font-medium text-[var(--muted)] sm:block">{title}</p>
          <button
            type="button"
            onClick={handleBack}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--green-600)] hover:text-[var(--green-700)]"
          >
            <ArrowLeft size={15} /> <span className="hidden sm:inline">Back</span>
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="Table of contents" className="order-2 lg:order-1 lg:sticky lg:top-24 lg:h-fit">
          <p className="px-1 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">On this page</p>
          <ol className="mt-3 space-y-0.5 border-l border-[var(--line)]">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={(event) => handleTocClick(event, section.id)}
                  aria-current={activeId === section.id ? 'location' : undefined}
                  className={`-ml-px block border-l-2 py-1.5 pl-3.5 text-sm leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-600)] ${
                    activeId === section.id
                      ? 'border-[var(--green-600)] font-semibold text-[var(--green-700)]'
                      : 'border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main id="legal-content" className="order-1 min-w-0 lg:order-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm font-medium text-[var(--muted)]">Last updated: {lastUpdated}</p>

          {intro ? (
            <div className="mt-6 max-w-3xl text-[15px] leading-7 text-[var(--text-secondary)]">{intro}</div>
          ) : null}

          <div className="mt-10 space-y-12">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} tabIndex={-1} className="scroll-mt-24 outline-none">
                <h2 className="text-xl font-bold text-[var(--text)] sm:text-[1.35rem]">
                  {index + 1}. {section.title}
                </h2>
                <div className="legal-prose mt-3 max-w-3xl text-[15px] leading-7 text-[var(--text-secondary)]">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
