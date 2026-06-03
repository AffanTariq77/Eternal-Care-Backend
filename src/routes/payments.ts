import { Router } from 'express';
import Stripe from 'stripe';
import { ensureAuth } from '../middleware/auth';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
}

// POST /payments/create-intent  — authenticated
router.post('/create-intent', ensureAuth, async (req, res) => {
  const { amount, currency = 'pkr', description = 'Eternal Care booking' } = req.body as any;
  if (!amount || typeof amount !== 'number' || amount < 1) {
    return res.status(400).json({ error: 'amount (positive number) is required' });
  }
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      description,
      automatic_payment_methods: { enabled: true },
    });
    return res.json({ clientSecret: intent.client_secret, intentId: intent.id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Payment intent creation failed' });
  }
});

export default router;
