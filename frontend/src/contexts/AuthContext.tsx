import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react';
import { AuthState, AuthContextType, LoginCredentials, LoginResponse, User, UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { websocketService } from '@/services/websocket.service';

// Auth reducer
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'UPDATE_USER'; payload: { user: User } }
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
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload.user,
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

async function mergeUserWithLiveScope(baseUser: User): Promise<User> {
  try {
    const profile = await apiService.getProfile();
    if (profile?.success && profile.user) {
      return {
        ...baseUser,
        ...profile.user,
        facilityIds: profile.user.facilityIds ?? baseUser.facilityIds,
      };
    }
  } catch (error) {
    console.warn('Failed to load live facility scope for user:', error);
  }
  return baseUser;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, dispatch] = useReducer(authReducer, initialState);

  const refreshUserScope = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('authUser');
    if (!token || !userStr) {
      return;
    }

    try {
      const baseUser = JSON.parse(userStr) as User;
      const user = await mergeUserWithLiveScope(baseUser);
      localStorage.setItem('authUser', JSON.stringify(user));
      dispatch({ type: 'UPDATE_USER', payload: { user } });
    } catch (error) {
      console.warn('Failed to refresh user facility scope:', error);
    }
  }, []);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('authUser');

      if (token && userStr) {
        try {
          const baseUser = JSON.parse(userStr);
          await apiService.verifyToken();
          const user = await mergeUserWithLiveScope(baseUser);
          localStorage.setItem('authUser', JSON.stringify(user));
          dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });

          websocketService.forceReconnect();
        } catch (error) {
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

  useEffect(() => {
    if (!authState.isAuthenticated) {
      return;
    }
    return websocketService.onScopeUpdate(() => {
      void refreshUserScope();
    });
  }, [authState.isAuthenticated, refreshUserScope]);

  const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const response = await apiService.login(credentials);

      if (response.success && response.user && response.token) {
        localStorage.setItem('authToken', response.token);
        const user = await mergeUserWithLiveScope(response.user);
        localStorage.setItem('authUser', JSON.stringify(user));

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user, token: response.token },
        });

        websocketService.forceReconnect();
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
      console.warn('Logout API call failed:', error);
    }

    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    localStorage.removeItem('blulok-widget-layouts');
    localStorage.removeItem('blulok-widget-instances');
    localStorage.removeItem('blulok-dashboard-v2');

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
      [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(authState.user.role) : false;
  };

  const contextValue: AuthContextType = {
    authState,
    login,
    logout,
    refreshUserScope,
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
