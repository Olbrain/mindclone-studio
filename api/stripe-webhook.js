// Stripe Webhook Handler - Process subscription events
const Stripe = require('stripe');
const { initializeFirebaseAdmin, admin } = require('./_firebase-admin');

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();
const db = admin.firestore();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Disable body parsing to get raw body for signature verification
module.exports.config = {
  api: {
    bodyParser: false
  }
};

// Helper to get raw body
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let event;

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    // Verify webhook signature
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    console.log(`[Stripe Webhook] Event received: ${event.type}`);

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};

/**
 * Handle checkout.session.completed
 * Links Stripe customer to Firebase user
 */
async function handleCheckoutComplete(session) {
  const userId = session.client_reference_id;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId) {
    console.error('[Stripe Webhook] No client_reference_id in checkout session');
    return;
  }

  console.log(`[Stripe Webhook] Checkout completed for user ${userId}`);

  // Update user document with Stripe info
  await db.collection('users').doc(userId).set({
    billing: {
      stripeCustomerId: customerId,
      subscriptionId: subscriptionId,
      subscriptionStatus: 'active'
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`[Stripe Webhook] User ${userId} billing info updated`);
}

/**
 * Handle subscription created/updated
 * Syncs subscription status to Firestore
 */
async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;

  // Find user by Stripe customer ID
  const usersSnapshot = await db.collection('users')
    .where('billing.stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`[Stripe Webhook] No user found for customer: ${customerId}`);
    return;
  }

  const userRef = usersSnapshot.docs[0].ref;
  const userId = usersSnapshot.docs[0].id;

  console.log(`[Stripe Webhook] Updating subscription for user ${userId}: ${subscription.status}`);

  // Calculate access level based on status
  const accessLevel = ['active', 'trialing'].includes(subscription.status) ? 'full' : 'read_only';

  await userRef.update({
    'billing.subscriptionId': subscription.id,
    'billing.subscriptionStatus': subscription.status,
    'billing.currentPeriodEnd': subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    'billing.cancelAtPeriodEnd': subscription.cancel_at_period_end || false,
    'billing.trialEnd': subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    'billing.priceId': subscription.items?.data?.[0]?.price?.id || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Stripe Webhook] User ${userId} subscription updated to: ${subscription.status}`);
}

/**
 * Handle subscription deleted
 * Mark subscription as canceled
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  // Find user by Stripe customer ID
  const usersSnapshot = await db.collection('users')
    .where('billing.stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`[Stripe Webhook] No user found for customer: ${customerId}`);
    return;
  }

  const userRef = usersSnapshot.docs[0].ref;
  const userId = usersSnapshot.docs[0].id;

  console.log(`[Stripe Webhook] Subscription deleted for user ${userId}`);

  await userRef.update({
    'billing.subscriptionStatus': 'canceled',
    'billing.subscriptionId': null,
    'billing.cancelAtPeriodEnd': false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Handle invoice paid
 * Confirms successful payment
 */
async function handleInvoicePaid(invoice) {
  console.log(`[Stripe Webhook] Invoice paid: ${invoice.id} for customer ${invoice.customer}`);
  // Subscription status is updated via subscription.updated event
}

/**
 * Handle payment failed
 * Mark subscription as past_due
 */
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;

  console.log(`[Stripe Webhook] Payment failed for customer ${customerId}`);

  // Find user by Stripe customer ID
  const usersSnapshot = await db.collection('users')
    .where('billing.stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`[Stripe Webhook] No user found for customer: ${customerId}`);
    return;
  }

  const userRef = usersSnapshot.docs[0].ref;
  const userId = usersSnapshot.docs[0].id;

  await userRef.update({
    'billing.subscriptionStatus': 'past_due',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Stripe Webhook] User ${userId} marked as past_due`);

  // TODO: Send email notification about payment failure
}
