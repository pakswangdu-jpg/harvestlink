import {
  useEffect, useId, useRef, useState,
} from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { createAutocompleteSessionToken, getPlaceDetails, searchAddressSuggestions } from '../../services/placesService';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

// Google-Maps/Grab-style address search — drop-in replacement for a plain
// <input value/onChange/onBlur/placeholder>, so every existing call site (FormField wraps
// it exactly like the bare input it replaces) needs no other change. `onChange(text)` fires
// on every keystroke AND once more on selection (with the picked suggestion's text) — a
// caller that only cares about the address string can keep using onChange alone, unchanged
// from before this component existed. `onSelect({ placeId, formattedAddress, lat, lng, zipCode })`
// is purely additive, for a caller that also wants coordinates and/or the postal code.
export default function AddressAutocomplete({
  id, name, value, onChange, onSelect, onBlur, placeholder, disabled = false, error,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  // idle (nothing typed yet / too short) | loading | success | empty | error
  const [status, setStatus] = useState('idle');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState('');

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  // Every search bumps this; a response only gets applied if it's still the most recent
  // one requested — the new Places API has no AbortController to cancel an in-flight
  // fetch, so this is how "cancel previous requests when the user keeps typing" is done:
  // the stale response is simply discarded on arrival instead of being applied over newer
  // (or empty) results.
  const requestIdRef = useRef(0);
  // Lazily minted on first search of an editing "session" and spent (reset to null) the
  // moment a Place Details fetch actually uses it — see placesService.js's session-token
  // comment for why (one Places-API billing session per search-then-pick sequence).
  const sessionTokenRef = useRef(null);

  const listboxId = useId();

  // Cancels whatever search is currently pending — a scheduled-but-not-yet-fired debounce
  // timer (clearTimeout stops it from ever calling runSearch) AND an already-in-flight fetch
  // (bumping requestIdRef makes runSearch discard that response as stale once it resolves,
  // same mechanism as a superseded keystroke). Every path that dismisses the dropdown
  // (select / Escape / click outside) needs this — without it, a search kicked off just
  // before the user dismissed the field still lands ~300ms later and pops the dropdown back
  // open with results for text the user has already moved past.
  const cancelPendingSearch = () => {
    clearTimeout(debounceTimerRef.current);
    requestIdRef.current += 1;
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        cancelPendingSearch();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keeps the arrow-key-highlighted option visible — up to 8 rows can exceed the dropdown's
  // capped max-height (see .address-autocomplete-dropdown), so without this, arrowing past
  // the visible area highlights an option the user can no longer see.
  useEffect(() => {
    if (highlightedIndex < 0) return;
    document.getElementById(`${listboxId}-option-${highlightedIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, listboxId]);

  const getSessionToken = () => {
    if (!sessionTokenRef.current) sessionTokenRef.current = createAutocompleteSessionToken();
    return sessionTokenRef.current;
  };

  const runSearch = async (query) => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setIsOpen(true);
    try {
      const token = await getSessionToken();
      const results = await searchAddressSuggestions(query, { sessionToken: token });
      if (requestIdRef.current !== requestId) return; // superseded by a newer keystroke
      setSuggestions(results);
      setHighlightedIndex(-1);
      setStatus(results.length ? 'success' : 'empty');
      setAnnouncement(
        results.length ? `${results.length} address suggestion${results.length === 1 ? '' : 's'} available.` : 'No addresses found.',
      );
    } catch {
      if (requestIdRef.current !== requestId) return;
      setSuggestions([]);
      setStatus('error');
      setAnnouncement('Something went wrong while searching for addresses.');
    }
  };

  // Cleanup-only — cancels a pending debounced search if the field unmounts mid-wait (e.g.
  // the user navigates away right after typing).
  useEffect(() => () => clearTimeout(debounceTimerRef.current), []);

  // The debounce is a direct response to the user's own keystroke, not a reaction to some
  // external state change — so it belongs in the change handler itself, not in a useEffect
  // watching `value` (which would set state synchronously inside an effect body for the
  // "too short, reset" branch below, and re-fire redundantly if `value` is ever changed by
  // something other than typing, e.g. selectSuggestion's own onChange call).
  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    onChange(nextValue);

    cancelPendingSearch();
    const trimmed = nextValue.trim();
    if (trimmed.length < MIN_CHARS) {
      setIsOpen(false);
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    debounceTimerRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
  };

  const selectSuggestion = async (suggestion) => {
    cancelPendingSearch();
    setIsOpen(false);
    setSuggestions([]);
    setStatus('idle');
    setHighlightedIndex(-1);
    onChange(suggestion.description);

    // A caller that doesn't want coordinates (onSelect not passed — e.g. AuthPage.jsx/
    // Profile.jsx today, which only fill the address text) shouldn't pay for a Place Details
    // fetch whose result would just be thrown away. The address text above is already filled
    // from the free suggestion data, so skipping this costs nothing functionally.
    if (!onSelect) {
      sessionTokenRef.current = null;
      return;
    }

    const token = await getSessionToken();
    sessionTokenRef.current = null; // spent — the next search starts a fresh session
    try {
      const details = await getPlaceDetails(suggestion.placeId, { sessionToken: token });
      onSelect(details);
    } catch {
      // The address text is already filled in above — only the lat/lng/zipCode enrichment is
      // missing, so the field is still fully usable.
      onSelect({
        placeId: suggestion.placeId, formattedAddress: suggestion.description, lat: null, lng: null, zipCode: '',
      });
    }
  };

  const handleKeyDown = (event) => {
    if (!isOpen) {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) setIsOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestions.length) setHighlightedIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (suggestions.length) setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        event.preventDefault();
        selectSuggestion(suggestions[highlightedIndex]);
      }
    } else if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault();
        cancelPendingSearch();
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
  };

  // Tabbing to the next field (or otherwise moving focus away without clicking inside the
  // dropdown) doesn't fire the click-outside listener above — that only listens for a
  // mousedown outside the container, which a keyboard-driven focus change never triggers.
  // Without this, the dropdown stayed visually open, floating over whatever the user tabbed
  // to next. Safe to close unconditionally on blur (no delay/race to guard against): every
  // option already calls event.preventDefault() on its own onMouseDown specifically so
  // clicking one never blurs the input in the first place, so a real blur here only ever
  // means focus is genuinely leaving the field.
  const handleInputBlur = (event) => {
    cancelPendingSearch();
    setIsOpen(false);
    setHighlightedIndex(-1);
    onBlur?.(event);
  };

  const renderDropdownContent = () => {
    if (status === 'loading' && !suggestions.length) {
      return (
        <li className="address-autocomplete-status-row">
          <Loader2 size={15} className="address-autocomplete-spinner" /> Searching…
        </li>
      );
    }
    if (status === 'error') {
      return <li className="address-autocomplete-status-row address-autocomplete-error">Couldn&apos;t load suggestions. Please try again.</li>;
    }
    if (status === 'empty') {
      return <li className="address-autocomplete-status-row">No addresses found.</li>;
    }
    return suggestions.map((suggestion, index) => (
      <li
        key={suggestion.placeId}
        id={`${listboxId}-option-${index}`}
        role="option"
        aria-selected={index === highlightedIndex}
        className={`address-autocomplete-option ${index === highlightedIndex ? 'is-highlighted' : ''}`}
        onMouseEnter={() => setHighlightedIndex(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => selectSuggestion(suggestion)}
      >
        <MapPin size={15} className="address-autocomplete-option-icon" />
        <span className="address-autocomplete-option-text">
          <strong>{suggestion.mainText}</strong>
          {suggestion.secondaryText ? <span>{suggestion.secondaryText}</span> : null}
        </span>
      </li>
    ));
  };

  return (
    <div className="address-autocomplete" ref={containerRef}>
      <div className="input-icon-wrap">
        <MapPin size={16} className="input-icon" />
        <input
          id={id}
          name={name}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
          aria-invalid={error ? true : undefined}
          value={value}
          disabled={disabled}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length && (value || '').trim().length >= MIN_CHARS) setIsOpen(true);
          }}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        {status === 'loading' ? <Loader2 size={16} className="input-icon-trailing-static address-autocomplete-spinner" /> : null}
      </div>

      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>

      {isOpen ? (
        <ul className="address-autocomplete-dropdown" role="listbox" id={listboxId}>
          {renderDropdownContent()}
        </ul>
      ) : null}
    </div>
  );
}
