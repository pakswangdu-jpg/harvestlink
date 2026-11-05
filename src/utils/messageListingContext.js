export function getListingContextMessageIds(messages) {
  const visibleMessageIds = new Set();
  let previousContextKey = null;

  messages.forEach((message) => {
    if (message.productContext?.productId) {
      visibleMessageIds.add(message.id);
      previousContextKey = `product:${message.productContext.productId}`;
      return;
    }

    const contextKey = message.donationContext?.donationId
      ? `donation:${message.donationContext.donationId}`
      : null;

    if (!contextKey) {
      previousContextKey = null;
      return;
    }
    if (contextKey !== previousContextKey) visibleMessageIds.add(message.id);
    previousContextKey = contextKey;
  });

  return visibleMessageIds;
}
