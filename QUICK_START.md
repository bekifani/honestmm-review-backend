# Quick Start Guide - Subscription System

## 🚀 Get Started in 5 Minutes

### Step 1: Configure Stripe Keys

1. **Get your Stripe keys** from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)

2. **Add to `.env`** file:
```env
STRIPE_SECRET_KEY=sk_test_51xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
FRONTEND_URL=http://localhost:5173
```

### Step 2: Create Stripe Products

1. Go to [Stripe Products](https://dashboard.stripe.com/test/products)

2. **Create Basic Plan:**
   - Click "Add Product"
   - Name: `Basic Plan`
   - Description: `10 file analyses, 50 chat messages per month`
   - Pricing: Recurring → Monthly → $9.99
   - Click "Save product"
   - **Copy the Price ID** (starts with `price_`)

3. **Create Pro Plan:**
   - Name: `Pro Plan`
   - Description: `50 file analyses, 300 chat messages per month`
   - Pricing: Recurring → Monthly → $29.99
   - **Copy the Price ID**

4. **Create Premium Plan:**
   - Name: `Premium Plan`
   - Description: `Unlimited analyses and chat`
   - Pricing: Recurring → Monthly → $99.99
   - **Copy the Price ID**

### Step 3: Configure Webhook (For Production)

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks)

2. Click "Add endpoint"

3. **Endpoint URL**: `https://yourdomain.com/api/subscription/webhook`

4. **Select events**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

5. **Copy the Signing Secret** → Add to `.env` as `STRIPE_WEBHOOK_SECRET`

### Step 4: Test Locally

#### Option A: Use Stripe CLI (Recommended for Development)

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/subscription/webhook

# This will give you a webhook secret starting with whsec_
# Add it to your .env file
```

#### Option B: Use Test API Calls

```bash
# Start your server
npm run dev

# Test getting plans (no auth needed)
curl http://localhost:3001/api/subscription/plans

# Test with authentication (replace YOUR_TOKEN)
curl http://localhost:3001/api/subscription/current \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 5: Test Checkout Flow

1. **Create a test user** and get auth token

2. **Create checkout session**:
```bash
curl -X POST http://localhost:3001/api/subscription/checkout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "basic",
    "stripePriceId": "price_YOUR_PRICE_ID_HERE"
  }'
```

3. **Response will contain**:
```json
{
  "sessionId": "cs_test_xxxxx",
  "url": "https://checkout.stripe.com/c/pay/cs_test_xxxxx"
}
```

4. **Open the URL** in browser and complete checkout with test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

5. **After payment**, Stripe will send webhook → Your backend creates subscription

6. **Verify subscription**:
```bash
curl http://localhost:3001/api/subscription/current \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 6: Test Usage Tracking

1. **Analyze a file** (will track usage):
```bash
curl -X POST http://localhost:3001/api/file/1/analyze \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. **Check usage**:
```bash
curl http://localhost:3001/api/subscription/usage \
  -H "Authorization: Bearer YOUR_TOKEN"
```

3. **Response**:
```json
{
  "hasSubscription": true,
  "plan": "basic",
  "fileAnalyses": {
    "used": 1,
    "limit": 10,
    "remaining": 9
  },
  "chatMessages": {
    "used": 0,
    "limit": 50,
    "remaining": 50
  }
}
```

## 🧪 Test Cards

| Card Number | Scenario |
|-------------|----------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Decline |
| 4000 0025 0000 3155 | Requires authentication |
| 4000 0000 0000 9995 | Insufficient funds |

## 📊 Verify Database

```sql
-- Check subscriptions
SELECT * FROM "Subscription";

-- Check usage logs
SELECT * FROM "UsageLog" ORDER BY "createdAt" DESC LIMIT 10;

-- Check users with Stripe IDs
SELECT id, email, "stripeCustomerId" FROM "User" WHERE "stripeCustomerId" IS NOT NULL;
```

## 🔍 Debug Checklist

### Webhook Not Working?
- [ ] Stripe CLI running? (`stripe listen --forward-to ...`)
- [ ] Webhook secret in `.env` matches CLI output?
- [ ] Server running on correct port?
- [ ] Check server logs for webhook events

### Checkout Not Creating Subscription?
- [ ] Webhook received? (Check Stripe Dashboard → Webhooks)
- [ ] Check server logs for errors
- [ ] Verify webhook signature is valid
- [ ] Check database for subscription record

### Usage Not Tracking?
- [ ] User has active subscription?
- [ ] Middleware applied to routes?
- [ ] Check `UsageLog` table for entries
- [ ] Verify `trackUsage()` is called in controllers

### Limits Not Enforced?
- [ ] Middleware order correct in routes?
- [ ] Subscription status is "active"?
- [ ] Usage counters updating in database?
- [ ] Check middleware logs

## 🎯 Common Issues

### "No Stripe customer found"
**Solution**: User needs to complete checkout first. The customer is created during checkout.

### "Webhook signature verification failed"
**Solution**: 
1. Make sure `STRIPE_WEBHOOK_SECRET` matches your webhook endpoint
2. For local testing, use Stripe CLI secret
3. For production, use dashboard webhook secret

### "No active subscription"
**Solution**: 
1. Complete checkout flow
2. Wait for webhook to process
3. Check subscription status in database
4. Verify webhook was received (Stripe Dashboard)

### Usage not resetting
**Solution**: 
1. Webhook `invoice.payment_succeeded` must be enabled
2. Check webhook logs in Stripe Dashboard
3. Verify `resetUsage()` is called in webhook handler

## 📱 Frontend Integration Example

```typescript
// 1. Show available plans
const { plans } = await fetch('/api/subscription/plans').then(r => r.json());

// 2. Create checkout
const { url } = await fetch('/api/subscription/checkout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    plan: 'pro',
    stripePriceId: 'price_xxxxx'
  })
}).then(r => r.json());

// 3. Redirect to Stripe
window.location.href = url;

// 4. After payment, user returns to success page
// Show usage dashboard

// 5. Display usage
const usage = await fetch('/api/subscription/usage', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

console.log(`Used: ${usage.fileAnalyses.used}/${usage.fileAnalyses.limit}`);

// 6. Handle limit reached
try {
  await fetch('/api/file/1/analyze', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
} catch (error) {
  if (error.status === 403) {
    // Show upgrade modal
    showUpgradeModal();
  }
}
```

## 🎉 You're Ready!

Your subscription system is fully configured and ready to accept payments!

**Next Steps:**
1. Build frontend subscription UI
2. Test thoroughly with test cards
3. Switch to live Stripe keys for production
4. Monitor subscriptions in Stripe Dashboard

**Need Help?**
- Check `SUBSCRIPTION_SETUP.md` for detailed documentation
- Review `SUBSCRIPTION_SUMMARY.md` for quick reference
- Use `test-subscription.http` for API testing

---

**Happy Monetizing! 💰**
