import { NavigateFunction } from 'react-router-dom';
import { paginationService, PaginationTarget } from '@/services/pagination.service';

export interface NavigationTarget {
  id: string;
  type: 'user' | 'facility' | 'unit' | 'device';
  page?: number;
  searchParams?: Record<string, string>;
}

export interface HighlightOptions {
  duration?: number;
  color?: string;
  className?: string;
}

/**
 * Calculate the page number for a specific item based on its position in the data
 * @param itemIndex - The index of the item in the current data array
 * @param itemsPerPage - Number of items per page (default: 20)
 * @returns The page number (1-based)
 */
export const calculatePageForItem = (itemIndex: number, itemsPerPage: number = 20): number => {
  return Math.floor(itemIndex / itemsPerPage) + 1;
};

/**
 * Navigate to a page and highlight a specific item
 * @param navigate - React Router navigate function
 * @param target - The target to navigate to
 * @param options - Highlight animation options
 */
export const navigateAndHighlight = async (
  navigate: NavigateFunction,
  target: NavigationTarget,
  _options: HighlightOptions = {}
): Promise<void> => {
  // Options are available for future use if needed

  // Build the navigation path
  let path = '';
  let searchParams = new URLSearchParams();

  switch (target.type) {
    case 'user':
      path = '/users';
      if (target.page) {
        searchParams.set('page', target.page.toString());
      }
      break;
    case 'facility':
      path = '/facilities';
      if (target.page) {
        searchParams.set('page', target.page.toString());
      }
      break;
    case 'unit':
      path = '/units';
      if (target.page) {
        searchParams.set('page', target.page.toString());
      }
      break;
    case 'device':
      path = '/devices';
      if (target.page) {
        searchParams.set('page', target.page.toString());
      }
      break;
  }

  // Add any additional search parameters
  if (target.searchParams) {
    Object.entries(target.searchParams).forEach(([key, value]) => {
      searchParams.set(key, value);
    });
  }

  // Add the target ID as a search parameter for highlighting
  searchParams.set('highlight', target.id);

  const fullPath = searchParams.toString() ? `${path}?${searchParams.toString()}` : path;

  // Navigate to the page
  navigate(fullPath);

  // The highlighting will be handled by the target page's useHighlight hook
  // We just need to ensure the highlight ID is in the URL
};

/**
 * Calculate which page an item should be on based on its position in the full dataset
 * This is more accurate than calculatePageForItem which uses current page data
 * @param itemId - The ID of the item to find
 * @param allData - The complete dataset (not just current page)
 * @param itemsPerPage - Number of items per page (default: 20)
 * @returns The page number (1-based) where the item should be displayed
 */
export const calculatePageForItemInFullDataset = (
  itemId: string,
  allData: any[],
  itemsPerPage: number = 20
): number => {
  const itemIndex = allData.findIndex(item => item.id === itemId);
  if (itemIndex === -1) return 1; // Default to page 1 if not found
  return Math.floor(itemIndex / itemsPerPage) + 1;
};

/**
 * Navigate to a page and highlight a specific item, with proper pagination calculation
 * @param navigate - React Router navigate function
 * @param target - The target to navigate to
 * @param allData - The complete dataset to calculate correct page
 * @param itemsPerPage - Number of items per page (default: 20)
 * @param options - Highlight animation options
 */
export const navigateAndHighlightWithPagination = async (
  navigate: NavigateFunction,
  target: NavigationTarget,
  allData: any[],
  itemsPerPage: number = 20,
  options: HighlightOptions = {}
): Promise<void> => {
  // Calculate the correct page for this item
  const calculatedPage = calculatePageForItemInFullDataset(target.id, allData, itemsPerPage);
  
  // Create a new target with the calculated page
  const targetWithPage = {
    ...target,
    page: calculatedPage
  };
  
  // Use the existing navigation function
  await navigateAndHighlight(navigate, targetWithPage, options);
};

/**
 * Navigate to a page and highlight a specific item, with automatic pagination calculation
 * This function fetches the full dataset to determine the correct page
 * @param navigate - React Router navigate function
 * @param target - The target to navigate to
 * @param itemsPerPage - Number of items per page (default: 20)
 * @param options - Highlight animation options
 */
export const navigateAndHighlightWithAutoPagination = async (
  navigate: NavigateFunction,
  target: NavigationTarget,
  itemsPerPage: number = 20,
  options: HighlightOptions = {}
): Promise<void> => {
  try {
    // Convert NavigationTarget to PaginationTarget
    const paginationTarget: PaginationTarget = {
      id: target.id,
      type: target.type,
      filters: target.searchParams
    };

    // Get the correct page for this item
    const paginationInfo = await paginationService.getPageForItem(paginationTarget, itemsPerPage);
    
    // Create a new target with the calculated page
    const targetWithPage: NavigationTarget = {
      ...target,
      page: paginationInfo.page
    };
    
    // Use the existing navigation function
    await navigateAndHighlight(navigate, targetWithPage, options);
  } catch (error) {
    console.error('Error navigating with auto pagination:', error);
    // Fallback to page 1
    const targetWithPage: NavigationTarget = {
      ...target,
      page: 1
    };
    await navigateAndHighlight(navigate, targetWithPage, options);
  }
};

/**
 * Highlight an element with a brief animation
 * @param elementId - The ID of the element to highlight
 * @param duration - Duration of the highlight animation in milliseconds
 * @param color - Color of the highlight
 * @param className - CSS class name for the highlight
 */
export const highlightElement = (
  elementId: string,
  duration: number = 2000,
  color: string = '#3b82f6',
  className: string = 'highlight-animation'
): void => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element with ID "${elementId}" not found for highlighting`);
    return;
  }

  // Scroll to the element
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });

  // Add highlight animation
  const originalStyle = element.style.cssText;
  element.style.cssText = `
    ${originalStyle}
    position: relative;
    z-index: 10;
  `;

  // Create highlight overlay
  const highlightOverlay = document.createElement('div');
  highlightOverlay.className = className;
  highlightOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${color}20;
    border: 2px solid ${color};
    border-radius: 8px;
    pointer-events: none;
    z-index: 1;
    animation: highlightPulse 0.5s ease-out, highlightFade ${duration}ms ease-out;
  `;

  // Insert the overlay
  element.style.position = 'relative';
  element.appendChild(highlightOverlay);

  // Remove highlight after animation
  setTimeout(() => {
    if (highlightOverlay.parentNode) {
      highlightOverlay.parentNode.removeChild(highlightOverlay);
    }
    element.style.cssText = originalStyle;
  }, duration);
};

/**
 * Get the highlight ID from URL search parameters
 * @param searchParams - URL search parameters
 * @returns The highlight ID if present, null otherwise
 */
export const getHighlightIdFromUrl = (searchParams: URLSearchParams): string | null => {
  return searchParams.get('highlight');
};

/**
 * Generate a unique ID for an item based on its type and ID
 * @param type - The type of item
 * @param id - The item's ID
 * @returns A unique ID for highlighting
 */
export const generateHighlightId = (type: string, id: string): string => {
  return `${type}-${id}`;
};
