import { useState, useEffect, useRef } from 'react';
import { MapPinIcon } from '@heroicons/react/24/outline';

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}

declare global {
  interface Window {
    google: any;
    initGoogleMaps: () => void;
  }
}

export function AddressAutocomplete({ 
  value, 
  onChange, 
  placeholder = "Enter address",
  className = "",
  error 
}: AddressAutocompleteProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  // const [suggestions, setSuggestions] = useState<any[]>([]);
  // const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    // Load Google Maps script if not already loaded
    if (!window.google) {
      const script = document.createElement('script');
      const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey || apiKey === 'demo_key') {
        console.warn('Google Maps API key not configured. Address autocomplete disabled.');
        setIsLoaded(true);
        return;
      }
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      
      window.initGoogleMaps = () => {
        setIsLoaded(true);
      };
      
      script.onload = () => {
        setIsLoaded(true);
      };
      
      document.head.appendChild(script);
    } else {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && inputRef.current && window.google) {
      // Initialize Google Places Autocomplete
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: ['us', 'ca'] }, // Restrict to US and Canada
        fields: ['formatted_address', 'geometry.location', 'address_components']
      });

      // Add listener for place selection
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        
        if (place.formatted_address) {
          const lat = place.geometry?.location?.lat();
          const lng = place.geometry?.location?.lng();
          onChange(place.formatted_address, lat, lng);
        }
      });
    }
  }, [isLoaded, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // If Google Maps is not available, fall back to manual entry
    if (!isLoaded || !window.google) {
      // setShowSuggestions(false);
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <MapPinIcon className="h-5 w-5 text-gray-400" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        className={`block w-full pl-10 pr-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
          error 
            ? 'border-red-300 dark:border-red-600' 
            : 'border-gray-300 dark:border-gray-600'
        } bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${className}`}
        placeholder={placeholder}
      />
      
      {!isLoaded && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
        </div>
      )}
      
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      
      {!isLoaded && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Loading address suggestions...
        </p>
      )}
    </div>
  );
}
