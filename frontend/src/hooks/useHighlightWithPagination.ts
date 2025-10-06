import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getHighlightIdFromUrl, calculatePageForItemInFullDataset } from '@/utils/navigation.utils';

/**
 * Hook to handle highlighting elements with pagination support
 * @param data - The full data array to check for the highlighted item
 * @param getItemId - Function to get the ID from a data item
 * @param generateElementId - Function to generate the element ID for highlighting
 * @param currentPage - Current page number
 * @param itemsPerPage - Number of items per page
 * @param onPageChange - Function to call when page needs to change
 */
export const useHighlightWithPagination = <T>(
  data: T[],
  getItemId: (item: T) => string,
  generateElementId: (id: string) => string,
  currentPage: number,
  itemsPerPage: number = 20,
  onPageChange: (page: number) => void
) => {
  const [searchParams] = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const highlightId = getHighlightIdFromUrl(searchParams);
    if (highlightId && data.length > 0 && !isNavigating) {
      // Find the item in the full dataset
      const itemIndex = data.findIndex(item => getItemId(item) === highlightId);
      
      if (itemIndex !== -1) {
        // Calculate which page this item should be on
        const targetPage = calculatePageForItemInFullDataset(highlightId, data, itemsPerPage);
        
        // If we're not on the correct page, navigate there first
        if (targetPage !== currentPage) {
          setIsNavigating(true);
          onPageChange(targetPage);
          
          // Wait for page change to complete, then highlight
          setTimeout(() => {
            setIsNavigating(false);
            highlightElement(highlightId, generateElementId);
          }, 500); // Give time for page to load
        } else {
          // We're on the correct page, highlight immediately
          highlightElement(highlightId, generateElementId);
        }
      }
    }
  }, [searchParams, data, currentPage, itemsPerPage, onPageChange, isNavigating]);

  const highlightElement = (highlightId: string, generateElementId: (id: string) => string) => {
    let attempts = 0;
    const maxAttempts = 20; // Try for up to 2 seconds
    
    const tryHighlight = () => {
      const elementId = generateElementId(highlightId);
      const element = document.getElementById(elementId);
      
      if (element) {
        // Scroll to the element first
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
        
        // Wait a bit for scroll to complete, then highlight
        setTimeout(() => {
          // Store original styles
          const originalPosition = element.style.position;
          const originalZIndex = element.style.zIndex;
          const originalTransition = element.style.transition;
          
          // Set up for overlay border
          element.style.position = 'relative';
          element.style.zIndex = '10';
          element.style.transition = 'none';
          
          // Create overlay border element
          const overlay = document.createElement('div');
          overlay.style.position = 'absolute';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.right = '0';
          overlay.style.bottom = '0';
          overlay.style.border = '3px solid #3b82f6';
          overlay.style.borderRadius = '8px';
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = '1';
          overlay.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)';
          overlay.style.transition = 'all 0.3s ease';
          
          // Add overlay to element
          element.appendChild(overlay);
          
          // Create pulsing border animation
          let pulseCount = 0;
          const maxPulses = 4; // 2 complete pulses
          
          const pulseAnimation = () => {
            if (pulseCount < maxPulses) {
              const isExpanding = pulseCount % 2 === 0;
              const borderWidth = isExpanding ? '4px' : '3px';
              const shadowSize = isExpanding ? '4px' : '2px';
              const opacity = isExpanding ? '0.8' : '1';
              
              overlay.style.border = `${borderWidth} solid #3b82f6`;
              overlay.style.boxShadow = `0 0 0 ${shadowSize} rgba(59, 130, 246, 0.3)`;
              overlay.style.opacity = opacity;
              
              pulseCount++;
              setTimeout(pulseAnimation, 300);
            } else {
              // Final cleanup after all pulses
              setTimeout(() => {
                overlay.remove();
                element.style.position = originalPosition;
                element.style.zIndex = originalZIndex;
                element.style.transition = originalTransition;
              }, 200);
            }
          };
          
          // Start pulsing animation
          setTimeout(pulseAnimation, 100);
        }, 300);
      } else if (attempts < maxAttempts) {
        // Element not found yet, try again after a short delay
        attempts++;
        setTimeout(tryHighlight, 100);
      }
    };

    // Start highlighting process
    setTimeout(tryHighlight, 200);
  };
};
