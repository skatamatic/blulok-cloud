import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AuthState, AuthContextType, LoginCredentials, LoginResponse, User, UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { websocketService } from '@/services/websocket.service';

// Auth reducer
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return {
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGIN_FAILURE':
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'LOGOUT':
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
};

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('authUser');

      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          // Verify token is still valid
          await apiService.verifyToken();
          dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });
          
          // Retry WebSocket connection now that we have a valid token
          websocketService.retryConnectionIfNeeded();
        } catch (error) {
          // Token is invalid, clear storage
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          dispatch({ type: 'LOGIN_FAILURE' });
        }
      } else {
        dispatch({ type: 'LOGIN_FAILURE' });
      }
    };

    initializeAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const response = await apiService.login(credentials);
      
      if (response.success && response.user && response.token) {
        // Store in localStorage
        localStorage.setItem('authToken', response.token);
        localStorage.setItem('authUser', JSON.stringify(response.user));
        
        dispatch({ 
          type: 'LOGIN_SUCCESS', 
          payload: { user: response.user, token: response.token } 
        });
        
        // Retry WebSocket connection now that we have a valid token
        websocketService.retryConnectionIfNeeded();
      } else {
        dispatch({ type: 'LOGIN_FAILURE' });
      }

      return response;
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE' });
      return {
        success: false,
        message: 'An error occurred during login',
      };
    }
  };

  const logout = async () => {
    try {
      await apiService.logout();
    } catch (error) {
      // Continue with logout even if API call fails
      console.warn('Logout API call failed:', error);
    }

    // Clear storage and state
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    // Clear widget configs to prevent cross-user contamination
    localStorage.removeItem('blulok-widget-layouts');
    localStorage.removeItem('blulok-widget-instances');
    
    // Disconnect WebSocket
    websocketService.disconnect();
    
    dispatch({ type: 'LOGOUT' });
  };

  const hasRole = (roles: UserRole[]): boolean => {
    return authState.user ? roles.includes(authState.user.role) : false;
  };

  const isAdmin = (): boolean => {
    return authState.user ? 
      [UserRole.ADMIN, UserRole.DEV_ADMIN].includes(authState.user.role) : false;
  };

  const canManageUsers = (): boolean => {
    return authState.user ? 
      [UserRole.ADMIN, UserRole.DEV_ADMIN].includes(authState.user.role) : false;
  };

  const contextValue: AuthContextType = {
    authState,
    login,
    logout,
    isLoading: authState.isLoading,
    hasRole,
    isAdmin,
    canManageUsers,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
