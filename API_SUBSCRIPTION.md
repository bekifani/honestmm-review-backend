# Subscription API Documentation

## Base URL
```
http://localhost:3001/api/subscription
```

## Authentication
Most endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Endpoints

### 1. Get Available Plans

Get list of all subscription plans with their features and limits.

**Endpoint:** `GET /plans`  
**Authentication:** Not required  
**Rate Limit:** None

#### Request
```http
GET /api/subscription/plans
```

#### Response (200 OK)
```json
{
  "plans": {
    "basic": {
      "name": "Basic",
      "maxFileAnalyses": 10,
      "maxChatMessages": 50,
      "features": [
        "10 file analyses per month",
        "50 chat messages per month",
        "Basic AI analysis",
        "Email support"
      ]
    },
    "pro": {
      "name": "Pro",
      "maxFileAnalyses": 50,
      "maxChatMessages": 300,
      "features": [
        "50 file analyses per month",
        "300 chat messages per month",
        "Advanced AI analysis",
        "Priority email support",
        "Export reports"
      ]
    },
    "premium": {
      "name": "Premium",
      "maxFileAnalyses": -1,
      "maxChatMessages": -1,
      "features": [
        "Unlimited file analyses",
        "Unlimited chat messages",
        "Premium AI analysis",
        "24/7 priority support",
        "Export reports",
        "Custom integrations",
        "Dedicated account manager"
      ]
    }
  }
}
```

**Note:** `-1` means unlimited

---

### 2. Create Checkout Session

Create a Stripe checkout session to subscribe to a plan.

**Endpoint:** `POST /checkout`  
**Authentication:** Required  
**Rate Limit:** 10 requests per minute

#### Request
```http
POST /api/subscription/checkout
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "plan": "basic",
  "stripePriceId": "price_1234567890abcdef"
}
```

#### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| plan | string | Yes | Plan type: "basic", "pro", or "premium" |
| stripePriceId | string | Yes | Stripe Price ID from your Stripe Dashboard |

#### Response (200 OK)
```json
{
  "sessionId": "cs_test_a1b2c3d4e5f6g7h8i9j0",
  "url": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6g7h8i9j0"
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| sessionId | string | Stripe checkout session ID |
| url | string | Redirect URL to Stripe checkout page |

#### Error Responses

**400 Bad Request** - Missing or invalid parameters
```json
{
  "error": "Plan and price ID are required"
}
```

**400 Bad Request** - Invalid plan
```json
{
  "error": "Invalid plan"
}
```

**401 Unauthorized** - Missing or invalid token
```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to create checkout session"
}
```

#### Usage
1. Call this endpoint to get checkout URL
2. Redirect user to the URL
3. User completes payment on Stripe
4. Stripe redirects to your success URL
5. Webhook creates subscription in your database

---

### 3. Get Current Subscription

Get the authenticated user's current subscription details.

**Endpoint:** `GET /current`  
**Authentication:** Required  
**Rate Limit:** 60 requests per minute

#### Request
```http
GET /api/subscription/current
Authorization: Bearer YOUR_TOKEN
```

#### Response (200 OK) - With Subscription
```json
{
  "subscription": {
    "id": 1,
    "userId": 123,
    "stripeSubscriptionId": "sub_1234567890",
    "stripePriceId": "price_1234567890",
    "stripeProductId": "prod_1234567890",
    "plan": "pro",
    "status": "active",
    "currentPeriodStart": "2024-12-18T12:00:00.000Z",
    "currentPeriodEnd": "2025-01-18T12:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "maxFileAnalyses": 50,
    "maxChatMessages": 300,
    "usedFileAnalyses": 23,
    "usedChatMessages": 145,
    "usageResetAt": "2025-01-18T12:00:00.000Z",
    "createdAt": "2024-12-18T12:00:00.000Z",
    "updatedAt": "2024-12-18T12:00:00.000Z",
    "planName": "Pro",
    "features": [
      "50 file analyses per month",
      "300 chat messages per month",
      "Advanced AI analysis",
      "Priority email support",
      "Export reports"
    ],
    "fileAnalysesRemaining": 27,
    "chatMessagesRemaining": 155
  }
}
```

#### Response (200 OK) - No Subscription
```json
{
  "subscription": null
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to fetch subscription"
}
```

---

### 4. Get Usage Statistics

Get detailed usage statistics for the current billing period.

**Endpoint:** `GET /usage`  
**Authentication:** Required  
**Rate Limit:** 60 requests per minute

#### Request
```http
GET /api/subscription/usage
Authorization: Bearer YOUR_TOKEN
```

#### Response (200 OK) - With Subscription
```json
{
  "hasSubscription": true,
  "plan": "basic",
  "status": "active",
  "fileAnalyses": {
    "used": 7,
    "limit": 10,
    "remaining": 3
  },
  "chatMessages": {
    "used": 32,
    "limit": 50,
    "remaining": 18
  },
  "currentPeriodEnd": "2025-01-18T12:00:00.000Z",
  "usageResetAt": "2025-01-18T12:00:00.000Z"
}
```

#### Response (200 OK) - No Subscription
```json
{
  "hasSubscription": false,
  "fileAnalyses": {
    "used": 0,
    "limit": 0,
    "remaining": 0
  },
  "chatMessages": {
    "used": 0,
    "limit": 0,
    "remaining": 0
  }
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| hasSubscription | boolean | Whether user has an active subscription |
| plan | string | Current plan name |
| status | string | Subscription status (active, canceled, past_due, trialing) |
| fileAnalyses.used | number | Number of file analyses used this period |
| fileAnalyses.limit | number | Maximum allowed (-1 for unlimited) |
| fileAnalyses.remaining | number | Remaining analyses (-1 for unlimited) |
| chatMessages.* | object | Same structure as fileAnalyses |
| currentPeriodEnd | string | When current billing period ends |
| usageResetAt | string | When usage counters will reset |

---

### 5. Cancel Subscription

Cancel the user's subscription.

**Endpoint:** `POST /cancel`  
**Authentication:** Required  
**Rate Limit:** 10 requests per minute

#### Request
```http
POST /api/subscription/cancel
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "cancelAtPeriodEnd": true
}
```

#### Request Body
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| cancelAtPeriodEnd | boolean | No | true | If true, cancels at period end. If false, cancels immediately |

#### Response (200 OK) - Cancel at Period End
```json
{
  "message": "Subscription will be canceled at the end of the billing period",
  "subscription": {
    "id": 1,
    "plan": "pro",
    "status": "active",
    "cancelAtPeriodEnd": true,
    "currentPeriodEnd": "2025-01-18T12:00:00.000Z"
  }
}
```

#### Response (200 OK) - Cancel Immediately
```json
{
  "message": "Subscription canceled immediately",
  "subscription": {
    "id": 1,
    "plan": "pro",
    "status": "canceled",
    "cancelAtPeriodEnd": false
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to cancel subscription",
  "details": "No active subscription found"
}
```

---

### 6. Create Billing Portal Session

Create a Stripe billing portal session for subscription management.

**Endpoint:** `POST /billing-portal`  
**Authentication:** Required  
**Rate Limit:** 10 requests per minute

#### Request
```http
POST /api/subscription/billing-portal
Authorization: Bearer YOUR_TOKEN
```

#### Response (200 OK)
```json
{
  "url": "https://billing.stripe.com/session/live_xxxxxxxxxxxxx"
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| url | string | Redirect URL to Stripe billing portal |

#### Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to create billing portal session",
  "details": "No Stripe customer found"
}
```

#### Usage
The billing portal allows users to:
- Update payment method
- View invoices
- Cancel subscription
- Update billing information

---

### 7. Webhook Handler

Receives and processes Stripe webhook events.

**Endpoint:** `POST /webhook`  
**Authentication:** Stripe signature verification  
**Rate Limit:** None

#### Request
```http
POST /api/subscription/webhook
Stripe-Signature: t=1234567890,v1=xxxxxxxxxxxxx
Content-Type: application/json

{
  "id": "evt_xxxxxxxxxxxxx",
  "type": "checkout.session.completed",
  "data": {
    "object": { ... }
  }
}
```

#### Handled Events
| Event | Action |
|-------|--------|
| checkout.session.completed | Create subscription in database |
| customer.subscription.updated | Update subscription status and period |
| customer.subscription.deleted | Mark subscription as canceled |
| invoice.payment_succeeded | Reset usage counters for new period |
| invoice.payment_failed | Mark subscription as past_due |

#### Response (200 OK)
```json
{
  "received": true
}
```

#### Error Responses

**400 Bad Request** - Invalid signature
```json
{
  "error": "Invalid signature"
}
```

**400 Bad Request** - No signature
```json
{
  "error": "No signature"
}
```

**500 Internal Server Error**
```json
{
  "error": "Webhook handler failed"
}
```

---

## Usage Limit Enforcement

When a user reaches their usage limit, protected endpoints will return:

### File Analysis Limit Reached
```http
POST /api/file/:fileId/analyze
Authorization: Bearer YOUR_TOKEN
```

**Response (403 Forbidden)**
```json
{
  "error": "File analysis limit reached",
  "message": "You have reached your monthly file analysis limit. Please upgrade your plan.",
  "limit": 10,
  "remaining": 0
}
```

### Chat Message Limit Reached
```http
POST /api/chat
Authorization: Bearer YOUR_TOKEN
```

**Response (403 Forbidden)**
```json
{
  "error": "Chat message limit reached",
  "message": "You have reached your monthly chat message limit. Please upgrade your plan.",
  "limit": 50,
  "remaining": 0
}
```

### No Active Subscription
```http
POST /api/file/:fileId/analyze
Authorization: Bearer YOUR_TOKEN
```

**Response (403 Forbidden)**
```json
{
  "error": "No active subscription",
  "message": "You need an active subscription to access this feature."
}
```

---

## Subscription Status Values

| Status | Description |
|--------|-------------|
| active | Subscription is active and paid |
| canceled | Subscription has been canceled |
| past_due | Payment failed, subscription in grace period |
| trialing | In trial period (if configured) |

---

## Testing

### Test Cards
Use these cards in Stripe test mode:

| Card Number | Scenario |
|-------------|----------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 0002 | Card declined |
| 4000 0025 0000 3155 | Requires authentication (3D Secure) |
| 4000 0000 0000 9995 | Insufficient funds |

### Test Webhook Locally
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3001/api/subscription/webhook

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
```

---

## Error Codes Summary

| Status Code | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (limit reached or no subscription) |
| 404 | Not found |
| 500 | Internal server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| GET /plans | Unlimited |
| POST /checkout | 10/minute |
| GET /current | 60/minute |
| GET /usage | 60/minute |
| POST /cancel | 10/minute |
| POST /billing-portal | 10/minute |
| POST /webhook | Unlimited |

---

## Best Practices

1. **Cache subscription data** on frontend to reduce API calls
2. **Check usage before actions** to provide better UX
3. **Handle 403 errors** by showing upgrade prompts
4. **Verify webhooks** are being received in production
5. **Monitor failed payments** in Stripe Dashboard
6. **Test thoroughly** with test cards before going live
7. **Use Stripe CLI** for local webhook testing

---

## Support

For issues:
1. Check server logs for errors
2. Verify Stripe Dashboard for webhook delivery
3. Test with Stripe CLI locally
4. Review database for subscription records
5. Check environment variables are set correctly
