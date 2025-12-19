# Deployment Checklist - Subscription System

## 🔧 Pre-Deployment Setup

### 1. Environment Configuration
- [ ] Copy `.env.example` to `.env`
- [ ] Add `STRIPE_SECRET_KEY` (get from Stripe Dashboard)
- [ ] Add `STRIPE_WEBHOOK_SECRET` (get from Stripe Webhooks)
- [ ] Set `FRONTEND_URL` to your frontend domain
- [ ] Verify `DATABASE_URL` is correct
- [ ] Verify `ACCESS_TOKEN_SECRET` is set

### 2. Stripe Dashboard Setup
- [ ] Create Stripe account (or use existing)
- [ ] Switch to Test mode for development
- [ ] Create 3 products:
  - [ ] Basic Plan ($9.99/month) - Copy Price ID
  - [ ] Pro Plan ($29.99/month) - Copy Price ID
  - [ ] Premium Plan ($99.99/month) - Copy Price ID
- [ ] Configure webhook endpoint
- [ ] Select webhook events:
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_succeeded`
  - [ ] `invoice.payment_failed`
- [ ] Copy webhook signing secret

### 3. Database
- [ ] Migration already applied ✅
- [ ] Prisma Client generated ✅
- [ ] Verify tables exist:
  ```sql
  SELECT * FROM "Subscription" LIMIT 1;
  SELECT * FROM "UsageLog" LIMIT 1;
  ```

### 4. Local Testing
- [ ] Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (Mac) or download for Windows
- [ ] Login: `stripe login`
- [ ] Forward webhooks: `stripe listen --forward-to localhost:3001/api/subscription/webhook`
- [ ] Copy webhook secret from CLI output to `.env`
- [ ] Start server: `npm run dev`
- [ ] Test API: `curl http://localhost:3001/api/subscription/plans`

---

## 🧪 Testing Checklist

### API Endpoints
- [ ] `GET /api/subscription/plans` - Returns 3 plans
- [ ] `POST /api/subscription/checkout` - Creates checkout session
- [ ] `GET /api/subscription/current` - Returns null (no subscription yet)
- [ ] `GET /api/subscription/usage` - Returns hasSubscription: false

### Checkout Flow
- [ ] Create checkout session via API
- [ ] Open checkout URL in browser
- [ ] Complete payment with test card: `4242 4242 4242 4242`
- [ ] Verify redirect to success URL
- [ ] Check webhook received in Stripe CLI output
- [ ] Verify subscription created in database:
  ```sql
  SELECT * FROM "Subscription" WHERE "userId" = YOUR_USER_ID;
  ```
- [ ] `GET /api/subscription/current` - Now returns subscription
- [ ] `GET /api/subscription/usage` - Shows limits and usage

### Usage Tracking
- [ ] Analyze a file: `POST /api/file/:fileId/analyze`
- [ ] Check usage incremented:
  ```sql
  SELECT "usedFileAnalyses" FROM "Subscription" WHERE "userId" = YOUR_USER_ID;
  ```
- [ ] Verify usage log created:
  ```sql
  SELECT * FROM "UsageLog" WHERE "userId" = YOUR_USER_ID ORDER BY "createdAt" DESC LIMIT 1;
  ```
- [ ] Send a chat message: `POST /api/chat`
- [ ] Check chat usage incremented

### Limit Enforcement
- [ ] Use all file analyses (reach limit)
- [ ] Try to analyze another file
- [ ] Verify 403 error with message about limit
- [ ] Check error response includes limit and remaining count

### Subscription Management
- [ ] Cancel subscription: `POST /api/subscription/cancel`
- [ ] Verify `cancelAtPeriodEnd` set to true
- [ ] Create billing portal session: `POST /api/subscription/billing-portal`
- [ ] Open billing portal URL
- [ ] Verify can manage subscription

### Webhook Events
- [ ] Trigger `checkout.session.completed`: `stripe trigger checkout.session.completed`
- [ ] Trigger `invoice.payment_succeeded`: `stripe trigger invoice.payment_succeeded`
- [ ] Verify usage reset after invoice payment
- [ ] Trigger `customer.subscription.deleted`: `stripe trigger customer.subscription.deleted`
- [ ] Verify subscription status updated to "canceled"

---

## 🚀 Production Deployment

### 1. Stripe Production Setup
- [ ] Switch Stripe Dashboard to Live mode
- [ ] Create same 3 products in Live mode
- [ ] Copy Live Price IDs
- [ ] Update webhook endpoint to production URL
- [ ] Copy Live webhook secret
- [ ] Update `.env` with Live keys:
  - [ ] `STRIPE_SECRET_KEY=sk_live_...`
  - [ ] `STRIPE_WEBHOOK_SECRET=whsec_...`

### 2. Server Deployment
- [ ] Deploy backend to production server
- [ ] Set environment variables on server
- [ ] Run database migration on production
- [ ] Verify server is running
- [ ] Test health check: `curl https://yourdomain.com/api`

### 3. Webhook Configuration
- [ ] Verify webhook endpoint is accessible: `https://yourdomain.com/api/subscription/webhook`
- [ ] Test webhook delivery from Stripe Dashboard
- [ ] Monitor webhook logs for errors
- [ ] Set up webhook retry configuration in Stripe

### 4. Frontend Integration
- [ ] Update frontend API base URL to production
- [ ] Implement subscription plans page
- [ ] Implement checkout flow
- [ ] Implement usage dashboard
- [ ] Implement upgrade prompts when limit reached
- [ ] Add billing portal link
- [ ] Test end-to-end flow in production

### 5. Monitoring Setup
- [ ] Set up error logging (e.g., Sentry)
- [ ] Monitor webhook delivery success rate
- [ ] Set up alerts for failed payments
- [ ] Monitor subscription metrics:
  - Active subscriptions by plan
  - Monthly recurring revenue
  - Churn rate
  - Usage patterns
- [ ] Set up database backups

---

## 📊 Post-Deployment Verification

### Day 1
- [ ] Monitor webhook delivery (should be 100% success)
- [ ] Check for any error logs
- [ ] Verify first real subscription works
- [ ] Test with real payment method
- [ ] Monitor usage tracking

### Week 1
- [ ] Review subscription metrics
- [ ] Check for any failed payments
- [ ] Verify usage resets working on billing cycle
- [ ] Monitor customer support tickets
- [ ] Review webhook logs for any issues

### Month 1
- [ ] Analyze usage patterns by plan
- [ ] Review churn rate
- [ ] Check for any edge cases or bugs
- [ ] Optimize based on user feedback
- [ ] Consider plan adjustments if needed

---

## 🔒 Security Checklist

- [ ] Stripe keys stored in environment variables (not in code)
- [ ] `.env` file in `.gitignore`
- [ ] Webhook signature verification enabled
- [ ] HTTPS enabled in production
- [ ] Rate limiting configured
- [ ] Authentication required for all protected endpoints
- [ ] Server-side usage limit enforcement
- [ ] No sensitive data exposed in API responses
- [ ] Database credentials secured
- [ ] Regular security updates applied

---

## 📈 Monitoring Queries

### Daily Checks
```sql
-- New subscriptions today
SELECT COUNT(*) FROM "Subscription" 
WHERE DATE("createdAt") = CURRENT_DATE;

-- Active subscriptions by plan
SELECT plan, COUNT(*) FROM "Subscription" 
WHERE status = 'active' 
GROUP BY plan;

-- Failed payments
SELECT COUNT(*) FROM "Subscription" 
WHERE status = 'past_due';
```

### Weekly Reports
```sql
-- Usage statistics
SELECT 
  plan,
  AVG("usedFileAnalyses") as avg_files,
  AVG("usedChatMessages") as avg_chats
FROM "Subscription"
WHERE status = 'active'
GROUP BY plan;

-- Users near limit
SELECT 
  u.email,
  s.plan,
  s."usedFileAnalyses",
  s."maxFileAnalyses"
FROM "Subscription" s
JOIN "User" u ON u.id = s."userId"
WHERE s."usedFileAnalyses" >= s."maxFileAnalyses" * 0.8
  AND s."maxFileAnalyses" > 0;

-- Churn this week
SELECT COUNT(*) FROM "Subscription"
WHERE status = 'canceled'
  AND "updatedAt" >= NOW() - INTERVAL '7 days';
```

---

## 🆘 Troubleshooting

### Webhook Not Received
1. Check Stripe Dashboard → Webhooks → View logs
2. Verify endpoint URL is correct
3. Check server logs for incoming requests
4. Verify webhook secret matches
5. Test with Stripe CLI: `stripe trigger checkout.session.completed`

### Subscription Not Created
1. Check webhook was received (Stripe Dashboard)
2. Check server logs for errors
3. Verify database connection
4. Check webhook signature validation
5. Manually check database for subscription record

### Usage Not Tracking
1. Verify middleware is applied to routes
2. Check `UsageLog` table for entries
3. Verify `trackUsage()` is called in controllers
4. Check subscription exists and is active
5. Review server logs for errors

### Limits Not Enforced
1. Verify middleware order in routes
2. Check subscription status is "active"
3. Verify usage counters in database
4. Test with user who has reached limit
5. Check middleware logs

---

## 📞 Support Resources

- **Stripe Dashboard**: https://dashboard.stripe.com/
- **Stripe API Docs**: https://stripe.com/docs/api
- **Stripe CLI**: https://stripe.com/docs/stripe-cli
- **Test Cards**: https://stripe.com/docs/testing
- **Webhook Testing**: https://stripe.com/docs/webhooks/test

---

## ✅ Final Checklist

Before marking as complete:

- [ ] All tests passing
- [ ] Documentation reviewed
- [ ] Environment variables set
- [ ] Stripe products created
- [ ] Webhooks configured
- [ ] Local testing complete
- [ ] Production deployment done
- [ ] Monitoring set up
- [ ] Security verified
- [ ] Team trained on system

---

## 🎉 Launch Ready!

Once all items are checked, your subscription system is ready to accept real payments and start generating revenue!

**Estimated Setup Time**: 2-3 hours  
**Testing Time**: 1-2 hours  
**Total Time to Launch**: 3-5 hours

**Good luck with your launch! 🚀💰**
