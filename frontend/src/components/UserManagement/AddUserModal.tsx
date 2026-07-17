import React, { useState, useEffect, useMemo } from 'react';
import type { AxiosError } from 'axios';
import { useForm } from 'react-hook-form';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/Modal/Modal';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MIN_LENGTH,
} from '@/constants/password';

interface AddUserFormData {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  /** Omit password — user completes first-time login / invite flow */
  skipPassword: boolean;
  /** After create, send invite (SMS if phone set, else email when enabled). Only when skip password. */
  sendInvite: boolean;
}

interface InactiveUserSummary {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  phoneNumber?: string | null;
}

interface CreateUserApiResponse {
  success: boolean;
  message?: string;
  inviteSent?: boolean;
  inviteWarning?: string;
  reactivated?: boolean;
  code?: string;
  inactiveUser?: InactiveUserSummary;
}

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When true, default "send invite" on for skip-password flow (e.g. facility / HMI dashboard). */
  defaultSendInviteWhenSkippingPassword?: boolean;
}

function buildCreatePayload(
  data: AddUserFormData,
  selectedFacilityIds: string[],
  reactivateIfInactive?: boolean,
): Record<string, unknown> {
  const roleVal = data.role as UserRole;
  const needsFacilities =
    roleVal && ![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(roleVal);

  const payload: Record<string, unknown> = {
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role,
  };
  if (needsFacilities) {
    payload.facilityIds = selectedFacilityIds;
  }
  if (data.phoneNumber?.trim()) {
    payload.phoneNumber = data.phoneNumber.trim();
  }
  if (!data.skipPassword) {
    payload.password = data.password;
  }
  if (data.skipPassword && data.sendInvite) {
    payload.sendInvite = true;
  }
  if (reactivateIfInactive) {
    payload.reactivateIfInactive = true;
  }
  return payload;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultSendInviteWhenSkippingPassword = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [reactivatePrompt, setReactivatePrompt] = useState<{
    message: string;
    inactiveUser: InactiveUserSummary;
    formData: AddUserFormData;
  } | null>(null);
  const { addToast } = useToast();
  const { authState } = useAuth();
  const [facilitiesForSelect, setFacilitiesForSelect] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(false);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
    setValue,
    unregister,
  } = useForm<AddUserFormData>({
    defaultValues: {
      skipPassword: false,
      sendInvite: defaultSendInviteWhenSkippingPassword,
      phoneNumber: '',
    },
  });

  const password = watch('password');
  const skipPassword = watch('skipPassword');
  const role = watch('role') as UserRole | '';

  const needsFacilityAssignment = useMemo(
    () => !!role && ![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(role as UserRole),
    [role]
  );

  const creatableRoleOptions = useMemo(() => {
    const u = authState.user;
    if (!u) {
      return [
        UserRole.TENANT,
        UserRole.MAINTENANCE,
        UserRole.BLULOK_TECHNICIAN,
        UserRole.FACILITY_ADMIN,
        UserRole.ADMIN,
      ];
    }
    if (u.role === UserRole.FACILITY_ADMIN) {
      return [UserRole.TENANT, UserRole.MAINTENANCE, UserRole.BLULOK_TECHNICIAN];
    }
    const base = [
      UserRole.TENANT,
      UserRole.MAINTENANCE,
      UserRole.BLULOK_TECHNICIAN,
      UserRole.FACILITY_ADMIN,
      UserRole.ADMIN,
      UserRole.DEV_ADMIN,
    ];
    if (u.role !== UserRole.DEV_ADMIN) {
      return base.filter((r) => r !== UserRole.DEV_ADMIN);
    }
    return base;
  }, [authState.user]);

  useEffect(() => {
    if (skipPassword) {
      unregister('password');
      unregister('confirmPassword');
    }
  }, [skipPassword, unregister]);

  useEffect(() => {
    if (role === UserRole.ADMIN || role === UserRole.DEV_ADMIN) {
      setSelectedFacilityIds([]);
    }
  }, [role]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoadingFacilities(true);
      try {
        const res = await apiService.getFacilities();
        if (cancelled || !res?.success || !Array.isArray(res.facilities)) return;
        let list = res.facilities as Array<{ id: string; name: string }>;
        // GET /facilities already returns only facilities the requester can access.
        setFacilitiesForSelect(list);
      } catch {
        if (!cancelled) setFacilitiesForSelect([]);
      } finally {
        if (!cancelled) setLoadingFacilities(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFacilityIds([]);
      setReactivatePrompt(null);
    }
  }, [isOpen]);

  const toggleFacility = (facilityId: string) => {
    setSelectedFacilityIds((prev) =>
      prev.includes(facilityId) ? prev.filter((id) => id !== facilityId) : [...prev, facilityId]
    );
  };

  const handleCreateSuccess = (
    response: CreateUserApiResponse,
    data: AddUserFormData,
  ) => {
    const title = response.reactivated ? 'User reactivated' : 'User created';
    if (response.inviteWarning) {
      addToast({ type: 'warning', title, message: response.inviteWarning });
    } else if (data.skipPassword && data.sendInvite && response.inviteSent) {
      addToast({
        type: 'success',
        title,
        message: 'Invite sent — user can complete setup from SMS or email.',
      });
    } else if (data.skipPassword && data.sendInvite && response.inviteSent === false) {
      addToast({
        type: 'info',
        title,
        message: 'Invite was not sent — check notification settings or use Resend invite on the user profile.',
      });
    } else if (response.reactivated) {
      addToast({
        type: 'success',
        title: 'User reactivated',
        message: 'The inactive account was restored with the details you entered.',
      });
    }
    reset();
    setSelectedFacilityIds([]);
    setReactivatePrompt(null);
    onSuccess();
    onClose();
  };

  const submitCreate = async (
    data: AddUserFormData,
    options?: { reactivateIfInactive?: boolean },
  ) => {
    setIsLoading(true);
    setError('');

    try {
      const payload = buildCreatePayload(
        data,
        selectedFacilityIds,
        options?.reactivateIfInactive,
      );

      const response = (await apiService.createUser(payload)) as CreateUserApiResponse;

      if (response.success) {
        handleCreateSuccess(response, data);
      } else if (response.code === 'USER_INACTIVE' && response.inactiveUser) {
        setReactivatePrompt({
          message: response.message || 'This user already exists but is inactive.',
          inactiveUser: response.inactiveUser,
          formData: data,
        });
      } else {
        setError(response.message || 'Failed to create user');
      }
    } catch (err) {
      const axiosErr = err as AxiosError<CreateUserApiResponse>;
      const body = axiosErr?.response?.data;
      if (
        axiosErr?.response?.status === 409 &&
        body?.code === 'USER_INACTIVE' &&
        body.inactiveUser
      ) {
        setReactivatePrompt({
          message: body.message || 'This user already exists but is inactive.',
          inactiveUser: body.inactiveUser,
          formData: data,
        });
      } else {
        setError(body?.message || 'An error occurred while creating the user');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: AddUserFormData) => {
    if (!data.skipPassword) {
      if (data.password !== data.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    const roleVal = data.role as UserRole;
    const needsFacilities =
      roleVal && ![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(roleVal);
    if (needsFacilities && selectedFacilityIds.length === 0) {
      setError('Select at least one facility for this role.');
      return;
    }

    await submitCreate(data);
  };

  const handleConfirmReactivate = async () => {
    if (!reactivatePrompt) return;
    await submitCreate(reactivatePrompt.formData, { reactivateIfInactive: true });
  };

  const handleClose = () => {
    reset({
      skipPassword: false,
      sendInvite: defaultSendInviteWhenSkippingPassword,
      phoneNumber: '',
    });
    setSelectedFacilityIds([]);
    setError('');
    setReactivatePrompt(null);
    onClose();
  };

  const inactive = reactivatePrompt?.inactiveUser;
  const reactivateMessage = inactive
    ? `${reactivatePrompt.message} Reactivate ${inactive.firstName} ${inactive.lastName}${
        inactive.email ? ` (${inactive.email})` : ''
      } and apply the details from this form?`
    : '';

  return (
    <>
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
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone number <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  {...register('phoneNumber')}
                  type="tel"
                  autoComplete="tel"
                  className="input mt-1"
                  placeholder="+1… or 10-digit (E.164 preferred)"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Used for SMS invites and login. Leave blank if not needed.
                </p>
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
                {creatableRoleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r === UserRole.TENANT && 'Tenant'}
                    {r === UserRole.MAINTENANCE && 'Maintenance'}
                    {r === UserRole.BLULOK_TECHNICIAN && 'BluLok Technician'}
                    {r === UserRole.FACILITY_ADMIN && 'Facility Admin'}
                    {r === UserRole.ADMIN && 'Admin'}
                    {r === UserRole.DEV_ADMIN && 'Dev Admin'}
                  </option>
                ))}
              </select>
              {errors.role && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.role.message}</p>
              )}
              </div>

              {needsFacilityAssignment && (
                <div>
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Facilities <span className="text-red-500">*</span>
                  </span>
                  {loadingFacilities ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading facilities…</p>
                  ) : facilitiesForSelect.length === 0 ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      No facilities available. You may need facility access, or create a facility first.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600">
                      {facilitiesForSelect.map((f) => (
                        <label
                          key={f.id}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                            checked={selectedFacilityIds.includes(f.id)}
                            onChange={() => toggleFacility(f.id)}
                          />
                          <span className="text-sm text-gray-900 dark:text-white">{f.name || f.id}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    User is linked to these facilities immediately (same rules as User → Facilities).
                  </p>
                </div>
              )}

              {role && (role === UserRole.ADMIN || role === UserRole.DEV_ADMIN) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 rounded-lg bg-gray-100 dark:bg-gray-800/80 px-3 py-2">
                  Global roles do not use per-facility associations.
                </p>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3 bg-gray-50/80 dark:bg-gray-900/40">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    {...register('skipPassword', {
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        if (e.target.checked) {
                          setValue('password', '');
                          setValue('confirmPassword', '');
                          setValue('sendInvite', defaultSendInviteWhenSkippingPassword);
                        }
                      },
                    })}
                  />
                  <span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Skip password (first-time login)
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      User will set their password via the invite / app flow. You can still add an optional phone for SMS.
                    </span>
                  </span>
                </label>

                {skipPassword && (
                  <label className="flex items-start gap-3 cursor-pointer pl-1">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      {...register('sendInvite')}
                    />
                    <span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Send invite SMS or email now
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Sends the invite link and verification code. SMS if phone is set; otherwise email (when enabled in system settings). Uncheck to skip — use &quot;Resend invite&quot; on the user later.
                      </span>
                    </span>
                  </label>
                )}
              </div>

              {!skipPassword && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: PASSWORD_MIN_LENGTH,
                      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
                    },
                    pattern: {
                      value: PASSWORD_COMPLEXITY_PATTERN,
                      message: PASSWORD_COMPLEXITY_MESSAGE,
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
              )}
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

      <ConfirmModal
        isOpen={Boolean(reactivatePrompt)}
        onClose={() => setReactivatePrompt(null)}
        onConfirm={handleConfirmReactivate}
        title="Reactivate existing user?"
        message={reactivateMessage}
        confirmText="Reactivate User"
        cancelText="Cancel"
        variant="info"
        isLoading={isLoading}
      />
    </>
  );
};
