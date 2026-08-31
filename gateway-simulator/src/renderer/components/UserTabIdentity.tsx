import type { UserInstanceState } from '@protocol/user-simulator-state';

type Props = {
  user: UserInstanceState;
};

export function UserTabIdentity({ user }: Props) {
  return (
    <div className="gateway-tab-identity" title={`${user.label} — ${user.email}`}>
      <p className="gateway-tab-identity-label">{user.label}</p>
      <p className="gateway-tab-identity-serial truncate">{user.email}</p>
    </div>
  );
}
