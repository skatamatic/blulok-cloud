import { useState, useEffect, useRef } from 'react';
import { MapPinIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface MapCardProps {
  address: string;
  latitude?: number;
  longitude?: number;
  facilityName?: string;
  className?: string;
  height?: string;
}

declare global {
  interface Window {
    google: any;
  }
}

export function MapCard({ 
  address, 
  latitude, 
  longitude, 
  facilityName,
  className = "",
  height = "h-64"
}: MapCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string>('');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);


  useEffect(() => {
    // Load Google Maps script if not already loaded
    if (!window.google) {
      const script = document.createElement('script');
      const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || 'demo_key';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        setIsLoaded(true);
      };
      
      script.onerror = () => {
        setError('Failed to load Google Maps');
      };
      
      document.head.appendChild(script);
    } else {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && mapRef.current && window.google && (latitude && longitude)) {
      try {
        // Initialize map
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: latitude, lng: longitude },
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            }
          ]
        });

        // Add marker
        new window.google.maps.Marker({
          position: { lat: latitude, lng: longitude },
          map: map,
          title: facilityName || address,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#147FD4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });

        mapInstanceRef.current = map;
      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Failed to initialize map');
      }
    }
  }, [isLoaded, latitude, longitude, address, facilityName]);

  if (error) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg ${height} ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-red-400 mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!latitude || !longitude) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg ${height} ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <MapPinIcon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {address || 'No location specified'}
            </p>
            {address && !latitude && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Coordinates not available
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}>
      {/* Map Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <MapPinIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              {facilityName || 'Location'}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {address}
            </p>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className={`relative ${height}`}>
        {!isLoaded ? (
          <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading map...</p>
            </div>
          </div>
        ) : (
          <div ref={mapRef} className="w-full h-full" />
        )}
      </div>

      {/* Coordinates Display */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400">
        <span>Coordinates: {latitude !== undefined && longitude !== undefined && 
          typeof latitude === 'number' && typeof longitude === 'number'
          ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` 
          : 'Not available'}</span>
      </div>
    </div>
  );
}
