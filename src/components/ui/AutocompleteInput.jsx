import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AutocompleteInput({ 
  value = '', 
  onChange, 
  suggestions = [], 
  placeholder, 
  className = "",
  required = false,
  name
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const normalise = (input) => (typeof input === 'string' ? input : String(input ?? ''));
  const inputValue = normalise(value);

  useEffect(() => {
    const loweredValue = inputValue.toLowerCase();
    const filtered = suggestions
      .map((suggestion) => normalise(suggestion))
      .filter((suggestion) => suggestion.toLowerCase().includes(loweredValue) && suggestion.toLowerCase() !== loweredValue)
      .slice(0, 5);
    setFilteredSuggestions(filtered);
  }, [inputValue, suggestions]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          inputRef.current && !inputRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const emitChange = (nextValue) => {
    if (typeof onChange === 'function') {
      onChange(nextValue);
    }
  };

  const handleInputChange = (event) => {
    const nextValue = event?.target?.value ?? '';
    emitChange(nextValue);
    if (nextValue.length > 0) {
      setIsOpen(true);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    emitChange(normalise(suggestion));
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    if (filteredSuggestions.length > 0 && inputValue.length > 0) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          name={name}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          className={`${className} pr-8`}
        />
        {suggestions.length > 0 && (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-purple-600 hover:text-purple-800 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {isOpen && filteredSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 neomorph rounded-xl bg-purple-50 max-h-48 overflow-y-auto border border-purple-200"
        >
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-4 py-3 text-left text-purple-800 hover:bg-purple-100 first:rounded-t-xl last:rounded-b-xl transition-colors border-b border-purple-100 last:border-b-0"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
