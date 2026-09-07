/** Stable key for deduplicating WebSocket subscriptions (type + optional filters). */
export function makeWebSocketSubscriptionKey(
  subscriptionType: string,
  filters?: Record<string, unknown>,
): string {
  return filters ? `${subscriptionType}:${JSON.stringify(filters)}` : subscriptionType;
}

export function parseWebSocketSubscriptionKey(subscriptionKey: string): {
  subscriptionType: string;
  filters?: Record<string, unknown>;
} {
  const colonIndex = subscriptionKey.indexOf(':');
  if (colonIndex < 0) {
    return { subscriptionType: subscriptionKey };
  }

  const subscriptionType = subscriptionKey.substring(0, colonIndex);
  const filtersJson = subscriptionKey.substring(colonIndex + 1);
  try {
    return {
      subscriptionType,
      filters: JSON.parse(filtersJson) as Record<string, unknown>,
    };
  } catch {
    return { subscriptionType: subscriptionKey };
  }
}
