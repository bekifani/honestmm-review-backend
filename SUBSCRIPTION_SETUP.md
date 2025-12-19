# Subscription & Usage Tracking System

## Overview
Complete Stripe subscription system with usage tracking for file analyses and chat messages. Supports Basic, Pro, and Premium plans with automatic usage limits and billing.

## Features Implemented

### ✅ Database Schema
- **User**: Added `stripeCustomerId` field
- **Subscription**: Complete subscription management
  - Plan details (basic/pro/premium)
  - Usage limits and tracking
  - Billing period management
  - Automatic usage reset
- **UsageLog**: Detailed usage tracking for analytics

### ✅ Subscription Plans

| Plan | File Analyses | Chat Messages | Price |
|------|--------------|---------------|-------|
| **Basic** | 10/month | 50/month | Set in Stripe |
| **Pro** | 50/month | 300/month | Set in Stripe |
| **Premium** | Unlimited | Unlimited | Set in Stripe |

### ✅ API Endpoints

#### Public Routes
- `GET /api/subscription/plans` - Get available plans

#### Protected Routes (Require Authentication)
- `POST /api/subscription/checkout` - Create Stripe checkout session
- `GET /api/subscription/current` - Get user's subscription
- `POST /api/subscription/cancel` - Cancel subscription
- `POST /api/subscription/billing-portal` - Access Stripe billing portal
- `GET /api/subscription/usage` - Get usage statistics

#### Webhook
- `POST /api/subscription/webhook` - Stripe webhook handler

### ✅ Usage Tracking
- **File Analysis**: Tracked automatically after successful AI analysis
- **Chat Messages**: Tracked automatically when saving chat
- **Automatic Reset**: Usage resets at the start of each billing period
- **Real-time Limits**: Middleware checks limits before allowing actions

### ✅ Middleware
- `checkFileAnalysisLimit` - Prevents file analysis if limit reached
- `checkChatMessageLimit` - Prevents chat if limit reached
- `requireActiveSubscription` - Ensures user has active subscription

## Setup Instructions

### 1. Environment Variables

Add to your `.env` file:

```env
# STRIPE CONFIGURATION
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
FRONTEND_URL=http://localhost:5173
```

### 2. Create Stripe Products

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Products** → **Add Product**
3. Create three products:

#### Basic Plan
- Name: "Basic Plan"
- Description: "10 file analyses, 50 chat messages per month"
- Pricing: Monthly recurring (e.g., $9.99/month)
- Copy the **Price ID** (starts with `price_`)

#### Pro Plan
- Name: "Pro Plan"
- Description: "50 file analyses, 300 chat messages per month"
- Pricing: Monthly recurring (e.g., $29.99/month)
- Copy the **Price ID**

#### Premium Plan
- Name: "Premium Plan"
- Description: "Unlimited analyses and chat"
- Pricing: Monthly recurring (e.g., $99.99/month)
- Copy the **Price ID**

### 3. Configure Webhook

1. Go to **Developers** → **Webhooks** in Stripe Dashboard
2. Click **Add endpoint**
3. Endpoint URL: `https://yourdomain.com/api/subscription/webhook`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Add to `.env` as `STRIPE_WEBHOOK_SECRET`

### 4. Database Migration

Already completed! The migration adds:
- `stripeCustomerId` to User table
- `Subscription` table
- `UsageLog` table

### 5. Test the Integration

#### Create Checkout Session
```bash
POST /api/subscription/checkout
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "plan": "basic",
  "stripePriceId": "price_xxxxxxxxxxxxx"
}
```

Response:
```json
{
  "sessionId": "cs_test_xxxxx",
  "url": "https://checkout.stripe.com/c/pay/cs_test_xxxxx"
}
```

#### Check Usage
```bash
GET /api/subscription/usage
Authorization: Bearer YOUR_TOKEN
```

Response:
```json
{
  "hasSubscription": true,
  "plan": "basic",
  "status": "active",
  "fileAnalyses": {
    "used": 3,
    "limit": 10,
    "remaining": 7
  },
  "chatMessages": {
    "used": 15,
    "limit": 50,
    "remaining": 35
  },
  "currentPeriodEnd": "2025-01-18T12:00:00.000Z",
  "usageResetAt": "2025-01-18T12:00:00.000Z"
}
```

## Frontend Integration

### 1. Subscription Page

```typescript
// Get available plans
const response = await fetch('/api/subscription/plans');
const { plans } = await response.json();

// Create checkout session
const checkoutResponse = await fetch('/api/subscription/checkout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    plan: 'pro',
    stripePriceId: 'price_xxxxx'
  })
});

const { url } = await checkoutResponse.json();
window.location.href = url; // Redirect to Stripe Checkout
```

### 2. Usage Display

```typescript
const response = await fetch('/api/subscription/usage', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const usage = await response.json();

// Display usage bars
<div>
  <p>File Analyses: {usage.fileAnalyses.used} / {usage.fileAnalyses.limit}</p>
  <ProgressBar 
    value={usage.fileAnalyses.used} 
    max={usage.fileAnalyses.limit} 
  />
</div>
```

### 3. Handle Limits

When a user hits their limit, the API returns:

```json
{
  "error": "File analysis limit reached",
  "message": "You have reached your monthly file analysis limit. Please upgrade your plan.",
  "limit": 10,
  "remaining": 0
}
```

Show an upgrade prompt to the user.

### 4. Billing Portal

```typescript
const response = await fetch('/api/subscription/billing-portal', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const { url } = await response.json();
window.location.href = url; // Redirect to Stripe Billing Portal
```

## How It Works

### Subscription Flow

1. **User selects plan** → Frontend calls `/api/subscription/checkout`
2. **Backend creates Stripe session** → Returns checkout URL
3. **User completes payment** → Stripe redirects to success URL
4. **Stripe sends webhook** → `checkout.session.completed` event
5. **Backend creates subscription** → Saves to database with usage limits
6. **User can now use features** → Within their plan limits

### Usage Tracking Flow

1. **User analyzes file** → Request hits `checkFileAnalysisLimit` middleware
2. **Middleware checks limit** → Queries subscription and usage
3. **If allowed** → Proceeds to analysis
4. **After analysis** → `trackUsage()` increments counter
5. **Usage logged** → Saved to `UsageLog` table for analytics

### Billing Period Reset

1. **Stripe sends invoice.payment_succeeded** → New billing period starts
2. **Webhook handler calls resetUsage()** → Resets counters to 0
3. **User gets fresh limits** → Can use features again

## Error Handling

### No Subscription
```json
{
  "error": "No active subscription",
  "message": "You need an active subscription to access this feature."
}
```

### Limit Reached
```json
{
  "error": "File analysis limit reached",
  "message": "You have reached your monthly file analysis limit. Please upgrade your plan.",
  "limit": 10,
  "remaining": 0
}
```

### Payment Failed
- Subscription status changes to `past_due`
- User receives email from Stripe
- Access continues for grace period (configurable in Stripe)

## Testing

### Test Mode
Use Stripe test keys (starting with `sk_test_`) for development.

### Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires authentication: `4000 0025 0000 3155`

### Webhook Testing
Use Stripe CLI for local webhook testing:

```bash
stripe listen --forward-to localhost:3001/api/subscription/webhook
```

## Production Checklist

- [ ] Replace test Stripe keys with live keys
- [ ] Update webhook endpoint to production URL
- [ ] Test all subscription flows end-to-end
- [ ] Set up monitoring for failed payments
- [ ] Configure email notifications in Stripe
- [ ] Test usage limit enforcement
- [ ] Verify webhook signature validation
- [ ] Set up proper error logging
- [ ] Test subscription cancellation flow
- [ ] Verify billing portal access

## Monitoring

### Key Metrics to Track
- Active subscriptions by plan
- Monthly recurring revenue (MRR)
- Churn rate
- Average usage per plan
- Failed payment rate
- Webhook delivery success rate

### Database Queries

```sql
-- Active subscriptions by plan
SELECT plan, COUNT(*) as count
FROM "Subscription"
WHERE status = 'active'
GROUP BY plan;

-- Usage statistics
SELECT 
  AVG(usedFileAnalyses) as avg_file_analyses,
  AVG(usedChatMessages) as avg_chat_messages
FROM "Subscription"
WHERE status = 'active';

-- Users hitting limits
SELECT userId, plan, usedFileAnalyses, maxFileAnalyses
FROM "Subscription"
WHERE usedFileAnalyses >= maxFileAnalyses
AND status = 'active';
```

## Support

For issues or questions:
1. Check Stripe Dashboard for payment/webhook logs
2. Review application logs for errors
3. Verify environment variables are set correctly
4. Test webhook delivery in Stripe Dashboard
5. Check database for subscription records

## Security Notes

- ✅ Webhook signatures are verified
- ✅ User authentication required for all protected routes
- ✅ Stripe keys stored in environment variables
- ✅ Usage limits enforced server-side
- ✅ Subscription status checked on every request
- ✅ No sensitive data exposed in client-side code

## Next Steps

1. **Add your Stripe keys** to `.env`
2. **Create products** in Stripe Dashboard
3. **Configure webhook** endpoint
4. **Test checkout flow** with test cards
5. **Build frontend UI** for subscription management
6. **Deploy and test** in production

---

**Implementation Complete! 🎉**

All backend infrastructure is ready. Now you can build the frontend subscription UI and start accepting payments!
