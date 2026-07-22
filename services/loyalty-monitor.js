export const REALTIME_FAILURE_STATUSES = Object.freeze(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export const shouldStartPolling = (status) => REALTIME_FAILURE_STATUSES.includes(status);

export const hasLoyaltyBalanceChanged = (request, card) => {
  if (!request || !card) return false;
  if (request.type === 'reward_redemption') {
    return Number(card.availableRewards) < Number(request.baselineRewards);
  }
  return card.currentStamps !== request.baselineStamps
    || card.availableRewards !== request.baselineRewards;
};

export const earnedRewardDelta = (request, card) => Math.max(
  0,
  Number(card?.availableRewards || 0) - Number(request?.baselineRewards || 0)
);
