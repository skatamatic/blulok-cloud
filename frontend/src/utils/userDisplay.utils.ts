export function getUserInitials(user: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const first = user.first_name?.trim()?.[0] ?? '';
  const last = user.last_name?.trim()?.[0] ?? '';
  if (first || last) return `${first}${last}`.toUpperCase();
  return user.email?.trim()?.[0]?.toUpperCase() ?? '?';
}

export function getUserDisplayName(user: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || user.email || 'User';
}

export function shouldShowUserEmail(user: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  return Boolean(user.email && getUserDisplayName(user) !== user.email);
}
