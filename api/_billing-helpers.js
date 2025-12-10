// Shared billing helper functions

/**
 * Compute user's access level based on subscription status
 * Returns: "full" or "read_only"
 */
function computeAccessLevel(userData) {
  if (!userData) return 'read_only';

  // Grandfathered users have full access forever
  if (userData.isGrandfathered) {
    return 'full';
  }

  const billing = userData.billing || {};
  const status = billing.subscriptionStatus;

  // Active or trialing subscriptions have full access
  if (['active', 'trialing'].includes(status)) {
    return 'full';
  }

  // Past due gets 3-day grace period
  if (status === 'past_due') {
    const periodEnd = billing.currentPeriodEnd?.toDate?.() ||
                      (billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd) : null);
    if (periodEnd) {
      const gracePeriodEnd = new Date(periodEnd);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
      if (new Date() < gracePeriodEnd) {
        return 'full';
      }
    }
  }

  // Check if still in initial trial (for users who signed up but haven't completed checkout)
  const trialEnd = billing.trialEnd?.toDate?.() ||
                   (billing.trialEnd ? new Date(billing.trialEnd) : null);
  if (trialEnd && new Date() < trialEnd) {
    return 'full';
  }

  // Default to read-only
  return 'read_only';
}

/**
 * Get number of days remaining in trial
 * Returns: number (days) or null if not in trial
 */
function getTrialDaysRemaining(userData) {
  const billing = userData?.billing || {};
  const trialEnd = billing.trialEnd?.toDate?.() ||
                   (billing.trialEnd ? new Date(billing.trialEnd) : null);

  if (!trialEnd) return null;

  const now = new Date();
  const end = new Date(trialEnd);
  const diffMs = end - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Get subscription status summary for API response
 */
function getSubscriptionSummary(userData) {
  if (!userData) {
    return {
      status: 'none',
      isGrandfathered: false,
      trialDaysRemaining: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      accessLevel: 'read_only'
    };
  }

  const billing = userData.billing || {};
  const accessLevel = computeAccessLevel(userData);
  const trialDaysRemaining = getTrialDaysRemaining(userData);

  // Convert Firestore timestamp to ISO string
  const periodEnd = billing.currentPeriodEnd?.toDate?.() ||
                    (billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd) : null);

  return {
    status: billing.subscriptionStatus || 'none',
    isGrandfathered: userData.isGrandfathered || false,
    trialDaysRemaining,
    currentPeriodEnd: periodEnd ? periodEnd.toISOString() : null,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd || false,
    accessLevel
  };
}

module.exports = {
  computeAccessLevel,
  getTrialDaysRemaining,
  getSubscriptionSummary
};
