/**
 * Visual marker for FMS placeholder tenants (no email/phone — cannot log in).
 */
export function PlaceholderUserBadge({
  className = '',
  size = 'sm',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const sizeClass =
    size === 'md'
      ? 'px-2.5 py-1 text-xs'
      : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 ${sizeClass} ${className}`}
      title="Synced from FMS without email or phone. Cannot log in until contact is added."
    >
      No login
    </span>
  );
}
