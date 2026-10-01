import {
  useEffect, useId, useRef, useState,
} from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { createAutocompleteSessionToken, getPlaceDetails, searchAddressSuggestions } from '../../services/placesService';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;








export default function AddressAutocomplete({
  id, name, value, onChange, onSelect, onBlur, placeholder, disabled = false, error,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const [status, setStatus] = useState('idle');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState('');

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);





  const requestIdRef = useRef(0);



  const sessionTokenRef = useRef(null);

  const listboxId = useId();








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
      if (requestIdRef.current !== requestId) return;
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



  useEffect(() => () => {
    clearTimeout(debounceTimerRef.current);
    requestIdRef.current += 1;
  }, []);






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
    const selectionId = requestIdRef.current;
    setIsOpen(false);
    setSuggestions([]);
    setStatus('idle');
    setHighlightedIndex(-1);
    onChange(suggestion.description);





    if (!onSelect) {
      sessionTokenRef.current = null;
      return;
    }

    const token = await getSessionToken();
    sessionTokenRef.current = null;
    try {
      const details = await getPlaceDetails(suggestion.placeId, { sessionToken: token });
      if (selectionId !== requestIdRef.current) return;
      onSelect(details);
    } catch {
      if (selectionId !== requestIdRef.current) return;


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
