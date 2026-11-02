export function getListingContextMessageIds(messages) {
  const visibleMessageIds = new Set();
  let previousContextKey = null;

  messages.forEach((message) => {
    const contextKey = message.productContext?.productId
      ? `product:${message.productContext.productId}`
      : message.donationContext?.donationId
        ? `donation:${message.donationContext.donationId}`
        : null;

    if (!contextKey) return;
    if (contextKey !== previousContextKey) visibleMessageIds.add(message.id);
    previousContextKey = contextKey;
  });

  return visibleMessageIds;
}
