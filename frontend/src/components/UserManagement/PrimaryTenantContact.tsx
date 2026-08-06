import { PlaceholderUserBadge } from '@/components/UserManagement/PlaceholderUserBadge';
import { formatUserContactSubtitle } from '@/utils/userDisplay.utils';

type TenantLike = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  is_placeholder?: boolean;
};

/**
 * Compact primary-tenant name + contact/placeholder line for unit tables and map panels.
 */
export function PrimaryTenantContact({
  tenant,
  nameClassName = 'font-medium',
  contactClassName = 'text-gray-500 dark:text-gray-400 text-xs',
}: {
  tenant: TenantLike;
  nameClassName?: string;
  contactClassName?: string;
}) {
  const name = [tenant.first_name, tenant.last_name].filter(Boolean).join(' ').trim() || 'Tenant';
  return (
    <div>
      <div className={`flex flex-wrap items-center gap-1.5 ${nameClassName}`}>
        <span>{name}</span>
        {tenant.is_placeholder ? <PlaceholderUserBadge /> : null}
      </div>
      <div className={contactClassName}>
        {formatUserContactSubtitle({
          email: tenant.email,
          is_placeholder: tenant.is_placeholder,
        })}
      </div>
    </div>
  );
}
