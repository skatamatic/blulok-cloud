import { useReconnectCountdown, formatReconnectLabel } from '../hooks/useReconnectCountdown';

type Props = {
  reconnectAt?: number;
  className?: string;
};

export function ReconnectIndicator({ reconnectAt, className = '' }: Props) {
  const secondsLeft = useReconnectCountdown(reconnectAt);
  if (secondsLeft == null) return null;

  return (
    <span
      className={`reconnect-indicator ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      {formatReconnectLabel(secondsLeft)}
    </span>
  );
}
