import React, { useState } from 'react';
import type { AxiosError } from 'axios';
import { useForm } from 'react-hook-form';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/Modal/Modal';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';

interface AddUserFormData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
}

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<AddUserFormData>();

  const password = watch('password');

  const onSubmit = async (data: AddUserFormData) => {
    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await apiService.createUser({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        password: data.password,
        role: data.role,
      });

      if (response.success) {
        reset();
        onSuccess();
        onClose();
      } else {
        setError(response.message || 'Failed to create user');
      }
    } catch (err) {
      const axiosErr = err as AxiosError<any>;
      const serverMessage = axiosErr?.response?.data?.message as string | undefined;
      setError(serverMessage || 'An error occurred while creating the user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Add New User
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Create a new user account for BluLok Cloud
        </p>
      </ModalHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <ModalBody>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-6">
              <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
            </div>
          )}

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                First Name
              </label>
              <input
                {...register('firstName', { required: 'First name is required' })}
                type="text"
                className="input mt-1"
                placeholder="Enter first name"
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.firstName.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Name
              </label>
              <input
                {...register('lastName', { required: 'Last name is required' })}
                type="text"
                className="input mt-1"
                placeholder="Enter last name"
              />
              {errors.lastName && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lastName.message}</p>
              )}
            </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email Address
              </label>
            <input
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address',
                },
              })}
              type="email"
              className="input mt-1"
              placeholder="Enter email address"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
            )}
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Role
              </label>
            <select
              {...register('role', { required: 'Role is required' })}
              className="input mt-1"
            >
              <option value="">Select a role</option>
              <option value={UserRole.TENANT}>Tenant</option>
              <option value={UserRole.MAINTENANCE}>Maintenance</option>
              <option value={UserRole.BLULOK_TECHNICIAN}>BluLok Technician</option>
              <option value={UserRole.FACILITY_ADMIN}>Facility Admin</option>
              <option value={UserRole.ADMIN}>Admin</option>
              <option value={UserRole.DEV_ADMIN}>Dev Admin</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.role.message}</p>
            )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <input
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters',
                  },
                  pattern: {
                    value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                    message: 'Password must contain uppercase, lowercase, number, and special character',
                  },
                })}
                type="password"
                className="input mt-1"
                placeholder="Enter password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password
              </label>
              <input
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: value => value === password || 'Passwords do not match',
                })}
                type="password"
                className="input mt-1"
                placeholder="Confirm password"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword.message}</p>
              )}
            </div>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating...
              </>
            ) : (
              'Create User'
            )}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
