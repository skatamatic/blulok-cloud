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
  is_placeholder?: boolean;
  isPlaceholder?: boolean;
}) {
  if (user.is_placeholder || user.isPlaceholder) return false;
  return Boolean(user.email && getUserDisplayName(user) !== user.email);
}

/** Secondary line under a user name (email, phone, or placeholder hint). */
export function formatUserContactSubtitle(user: {
  email?: string | null;
  phoneNumber?: string | null;
  phone_number?: string | null;
  isPlaceholder?: boolean;
  is_placeholder?: boolean;
}): string {
  if (user.isPlaceholder || user.is_placeholder) {
    return 'No login · FMS placeholder';
  }
  const email = user.email?.trim();
  if (email) return email;
  const phone = (user.phoneNumber ?? user.phone_number)?.trim();
  if (phone) return phone;
  return 'No contact on file';
}
