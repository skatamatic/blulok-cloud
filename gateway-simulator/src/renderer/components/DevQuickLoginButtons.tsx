import type { DevQuickLoginAccount } from '../config/devTestAccounts';
import { DEV_QUICK_LOGIN_ACCOUNTS } from '../config/devTestAccounts';
import { useBackendDevMode } from '../hooks/useBackendDevMode';

type Props = {
  backendUrl: string;
  disabled?: boolean;
  accounts?: DevQuickLoginAccount[];
  onSelect: (account: DevQuickLoginAccount) => void;
};

export function DevQuickLoginButtons({
  backendUrl,
  disabled = false,
  accounts = DEV_QUICK_LOGIN_ACCOUNTS,
  onSelect,
}: Props) {
  const isDev = useBackendDevMode(backendUrl);

  if (isDev !== true || !accounts.length) {
    return null;
  }

  return (
    <div className="dev-quick-login mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
      <p className="mb-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
        Quick login with test accounts
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {accounts.map((account) => (
          <button
            key={account.email}
            type="button"
            disabled={disabled}
            className="dev-quick-login-btn"
            onClick={() => onSelect(account)}
          >
            <span className="font-medium text-gray-900 dark:text-white">{account.label}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{account.email}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
