import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LockClosedIcon, EyeIcon, EyeSlashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const { login, authState } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';
  const isDev = (import.meta as any).env?.DEV;

  // Redirect if already authenticated
  useEffect(() => {
    if (authState.isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [authState.isAuthenticated, navigate, from]);

  // Clear error after 5 seconds, but only if user isn't actively typing
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const getErrorMessage = (error: any): string => {
    // Handle network/server errors
    if (error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error')) {
      return 'Unable to connect to server. Please check your internet connection and try again.';
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'Server is taking too long to respond. Please try again.';
    }
    
    // Handle HTTP status codes
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          return data?.message || 'Invalid email or password format.';
        case 401:
          return 'Invalid email or password. Please check your credentials and try again.';
        case 403:
          return 'Account access denied. Please contact support.';
        case 404:
          return 'Login service not found. Please contact support.';
        case 429:
          return 'Too many login attempts. Please wait a moment and try again.';
        case 500:
          return 'Server error occurred. Please try again later.';
        case 502:
        case 503:
        case 504:
          return 'Server is temporarily unavailable. Please try again later.';
        default:
          return data?.message || `Server error (${status}). Please try again.`;
      }
    }
    
    // Handle connection refused or server down
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Connection refused')) {
      return 'Server is not responding. Please check if the backend is running.';
    }
    
    // Default fallback
    return 'An unexpected error occurred. Please try again.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) {
      return;
    }
    
    setError('');
    setIsLoading(true);
    setIsSubmitting(true);

    try {
      const response = await login({ identifier, password });
      
      if (response.success) {
        navigate(from, { replace: true });
      } else {
        // Ensure we have a meaningful error message
        const errorMessage = response.message || 'Login failed. Please check your credentials.';
        setError(errorMessage);
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    // Only clear error when user starts typing, not on every keystroke
    if (error && e.target.value.length > 0) {
      setError('');
    }
  };

  const handleTestAccountLogin = async (emailOrPhone: string, password: string) => {
    setIdentifier(emailOrPhone);
    setPassword(password);
    setError('');
    setIsLoading(true);
    setIsSubmitting(true);

    try {
      const response = await login({ identifier: emailOrPhone, password });
      
      if (response.success) {
        navigate(from, { replace: true });
      } else {
        const errorMessage = response.message || 'Login failed. Please check your credentials.';
        setError(errorMessage);
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  if (authState.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-lg w-full">
        {/* Main Login Card */}
        <div className="card p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900 mb-4">
              <LockClosedIcon className="h-10 w-10 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Sign in to BluLok Cloud
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Secure access to your storage facility management system
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
                </div>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form ref={formRef} className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email or phone
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={handleInputChange(setIdentifier)}
                  className="input"
                  placeholder="Enter your email or phone"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={handleInputChange(setPassword)}
                    className="input pr-10"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading || isSubmitting}
                className="btn-primary w-full flex justify-center py-3 px-4 text-sm font-medium"
              >
                {isLoading || isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>

          {/* Development Testing Accounts - Only show in dev mode */}
          {isDev && (
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                  Quick login with test accounts:
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => handleTestAccountLogin('admin@blulok.com', 'Admin123!@#')}
                    disabled={isLoading || isSubmitting}
                    className="w-full bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md p-3 text-left transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">Admin Account</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">admin@blulok.com</div>
                  </button>
                  <button
                    onClick={() => handleTestAccountLogin('devadmin@blulok.com', 'DevAdmin123!@#')}
                    disabled={isLoading || isSubmitting}
                    className="w-full bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md p-3 text-left transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">Dev Admin Account</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">devadmin@blulok.com</div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
