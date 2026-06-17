import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { formatDate } from '@/utils/datetime.utils';

const getRoleBadgeColor = (role: string): string => {
  switch (role) {
    case 'dev_admin':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'admin':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'facility_admin':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
    case 'blulok_technician':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'maintenance':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
};

const formatRoleName = (role: string): string => {
  switch (role) {
    case 'dev_admin':
      return 'Dev Admin';
    case 'admin':
      return 'Admin';
    case 'facility_admin':
      return 'Facility Admin';
    case 'blulok_technician':
      return 'BluLok Tech';
    case 'maintenance':
      return 'Maintenance';
    case 'tenant':
      return 'Tenant';
    default:
      return role;
  }
};

export function SystemInformationSection() {
  const { authState } = useAuth();
  const feInfo = {
    version: (globalThis as { window?: { __APP_CONFIG__?: { frontendVersion?: string } } }).window
      ?.__APP_CONFIG__?.frontendVersion,
  };

  return (
    <div className="card">
      <div className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          System Information
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Version</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {feInfo.version ?? '1.0.0'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Environment</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">Development</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">User Role</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(
                  authState.user?.role || UserRole.TENANT
                )}`}
              >
                {formatRoleName(authState.user?.role || UserRole.TENANT)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Login</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {formatDate(new Date())}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
