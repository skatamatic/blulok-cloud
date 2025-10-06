import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface DropdownContextType {
  openDropdownId: string | null;
  openDropdown: (id: string) => void;
  closeDropdown: () => void;
  isDropdownOpen: (id: string) => boolean;
}

const DropdownContext = createContext<DropdownContextType | undefined>(undefined);

interface DropdownProviderProps {
  children: ReactNode;
}

export const DropdownProvider: React.FC<DropdownProviderProps> = ({ children }) => {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const openDropdown = useCallback((id: string) => {
    setOpenDropdownId(id);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpenDropdownId(null);
  }, []);

  const isDropdownOpen = useCallback((id: string) => {
    return openDropdownId === id;
  }, [openDropdownId]);

  // Global click handler to close dropdowns
  React.useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      // Check if click is inside any dropdown (including portaled ones)
      const target = event.target as Element;
      const isInsideDropdown = target.closest('.dropdown-container') || target.closest('.dropdown-menu');
      
      if (!isInsideDropdown) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [closeDropdown]);

  return (
    <DropdownContext.Provider value={{
      openDropdownId,
      openDropdown,
      closeDropdown,
      isDropdownOpen,
    }}>
      {children}
    </DropdownContext.Provider>
  );
};

export const useDropdown = (): DropdownContextType => {
  const context = useContext(DropdownContext);
  if (context === undefined) {
    throw new Error('useDropdown must be used within a DropdownProvider');
  }
  return context;
};
