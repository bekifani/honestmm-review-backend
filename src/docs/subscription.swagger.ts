/**
 * @swagger
 * tags:
 *   - name: Subscription
 *     description: Stripe subscription management and usage tracking
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SubscriptionPlan:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: Basic
 *         maxFileAnalyses:
 *           type: integer
 *           example: 10
 *           description: Maximum file analyses per month (-1 for unlimited)
 *         maxChatMessages:
 *           type: integer
 *           example: 50
 *           description: Maximum chat messages per month (-1 for unlimited)
 *         features:
 *           type: array
 *           items:
 *             type: string
 *           example: ["10 file analyses per month", "50 chat messages per month", "Basic AI analysis", "Email support"]
 *     
 *     Subscription:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         userId:
 *           type: integer
 *           example: 123
 *         stripeSubscriptionId:
 *           type: string
 *           example: sub_1234567890
 *         stripePriceId:
 *           type: string
 *           example: price_1234567890
 *         stripeProductId:
 *           type: string
 *           example: prod_1234567890
 *         plan:
 *           type: string
 *           enum: [basic, pro, premium]
 *           example: pro
 *         status:
 *           type: string
 *           enum: [active, canceled, past_due, trialing]
 *           example: active
 *         currentPeriodStart:
 *           type: string
 *           format: date-time
 *           example: 2024-12-18T12:00:00.000Z
 *         currentPeriodEnd:
 *           type: string
 *           format: date-time
 *           example: 2025-01-18T12:00:00.000Z
 *         cancelAtPeriodEnd:
 *           type: boolean
 *           example: false
 *         maxFileAnalyses:
 *           type: integer
 *           example: 50
 *         maxChatMessages:
 *           type: integer
 *           example: 300
 *         usedFileAnalyses:
 *           type: integer
 *           example: 23
 *         usedChatMessages:
 *           type: integer
 *           example: 145
 *         usageResetAt:
 *           type: string
 *           format: date-time
 *           example: 2025-01-18T12:00:00.000Z
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     UsageStats:
 *       type: object
 *       properties:
 *         hasSubscription:
 *           type: boolean
 *           example: true
 *         plan:
 *           type: string
 *           example: basic
 *         status:
 *           type: string
 *           example: active
 *         fileAnalyses:
 *           type: object
 *           properties:
 *             used:
 *               type: integer
 *               example: 7
 *             limit:
 *               type: integer
 *               example: 10
 *             remaining:
 *               type: integer
 *               example: 3
 *         chatMessages:
 *           type: object
 *           properties:
 *             used:
 *               type: integer
 *               example: 32
 *             limit:
 *               type: integer
 *               example: 50
 *             remaining:
 *               type: integer
 *               example: 18
 *         currentPeriodEnd:
 *           type: string
 *           format: date-time
 *           example: 2025-01-18T12:00:00.000Z
 *         usageResetAt:
 *           type: string
 *           format: date-time
 *           example: 2025-01-18T12:00:00.000Z
 *     
 *     CheckoutSession:
 *       type: object
 *       properties:
 *         sessionId:
 *           type: string
 *           example: cs_test_a1b2c3d4e5f6g7h8i9j0
 *         url:
 *           type: string
 *           example: https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6g7h8i9j0
 *     
 *     BillingPortalSession:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *           example: https://billing.stripe.com/session/live_xxxxxxxxxxxxx
 *     
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: File analysis limit reached
 *         message:
 *           type: string
 *           example: You have reached your monthly file analysis limit. Please upgrade your plan.
 *         limit:
 *           type: integer
 *           example: 10
 *         remaining:
 *           type: integer
 *           example: 0
 */

/**
 * @swagger
 * /subscription/plans:
 *   get:
 *     summary: Get available subscription plans
 *     description: Returns all available subscription plans with their features and limits. No authentication required.
 *     tags: [Subscription]
 *     responses:
 *       200:
 *         description: List of subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 plans:
 *                   type: object
 *                   properties:
 *                     basic:
 *                       $ref: '#/components/schemas/SubscriptionPlan'
 *                     pro:
 *                       $ref: '#/components/schemas/SubscriptionPlan'
 *                     premium:
 *                       $ref: '#/components/schemas/SubscriptionPlan'
 *             example:
 *               plans:
 *                 basic:
 *                   name: Basic
 *                   maxFileAnalyses: 10
 *                   maxChatMessages: 50
 *                   features: ["10 file analyses per month", "50 chat messages per month", "Basic AI analysis", "Email support"]
 *                 pro:
 *                   name: Pro
 *                   maxFileAnalyses: 50
 *                   maxChatMessages: 300
 *                   features: ["50 file analyses per month", "300 chat messages per month", "Advanced AI analysis", "Priority email support", "Export reports"]
 *                 premium:
 *                   name: Premium
 *                   maxFileAnalyses: -1
 *                   maxChatMessages: -1
 *                   features: ["Unlimited file analyses", "Unlimited chat messages", "Premium AI analysis", "24/7 priority support", "Export reports", "Custom integrations", "Dedicated account manager"]
 */

/**
 * @swagger
 * /subscription/checkout:
 *   post:
 *     summary: Create Stripe checkout session
 *     description: Creates a Stripe checkout session for subscribing to a plan. Returns a URL to redirect the user to Stripe's checkout page.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan
 *               - stripePriceId
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [basic, pro, premium]
 *                 example: pro
 *                 description: The subscription plan to subscribe to
 *               stripePriceId:
 *                 type: string
 *                 example: price_1234567890abcdef
 *                 description: Stripe Price ID from your Stripe Dashboard
 *     responses:
 *       200:
 *         description: Checkout session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CheckoutSession'
 *       400:
 *         description: Missing or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Plan and price ID are required
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       500:
 *         description: Failed to create checkout session
 */

/**
 * @swagger
 * /subscription/current:
 *   get:
 *     summary: Get current subscription
 *     description: Returns the authenticated user's current subscription details including usage statistics.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/Subscription'
 *                     - type: "null"
 *             examples:
 *               withSubscription:
 *                 summary: User has active subscription
 *                 value:
 *                   subscription:
 *                     id: 1
 *                     userId: 123
 *                     stripeSubscriptionId: sub_1234567890
 *                     stripePriceId: price_1234567890
 *                     stripeProductId: prod_1234567890
 *                     plan: pro
 *                     status: active
 *                     currentPeriodStart: "2024-12-18T12:00:00.000Z"
 *                     currentPeriodEnd: "2025-01-18T12:00:00.000Z"
 *                     cancelAtPeriodEnd: false
 *                     maxFileAnalyses: 50
 *                     maxChatMessages: 300
 *                     usedFileAnalyses: 23
 *                     usedChatMessages: 145
 *                     usageResetAt: "2025-01-18T12:00:00.000Z"
 *                     planName: Pro
 *                     features: ["50 file analyses per month", "300 chat messages per month", "Advanced AI analysis", "Priority email support", "Export reports"]
 *                     fileAnalysesRemaining: 27
 *                     chatMessagesRemaining: 155
 *               noSubscription:
 *                 summary: User has no subscription
 *                 value:
 *                   subscription: null
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       500:
 *         description: Failed to fetch subscription
 */

/**
 * @swagger
 * /subscription/usage:
 *   get:
 *     summary: Get usage statistics
 *     description: Returns detailed usage statistics for the current billing period.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UsageStats'
 *             examples:
 *               withSubscription:
 *                 summary: User has active subscription
 *                 value:
 *                   hasSubscription: true
 *                   plan: basic
 *                   status: active
 *                   fileAnalyses:
 *                     used: 7
 *                     limit: 10
 *                     remaining: 3
 *                   chatMessages:
 *                     used: 32
 *                     limit: 50
 *                     remaining: 18
 *                   currentPeriodEnd: "2025-01-18T12:00:00.000Z"
 *                   usageResetAt: "2025-01-18T12:00:00.000Z"
 *               noSubscription:
 *                 summary: User has no subscription
 *                 value:
 *                   hasSubscription: false
 *                   fileAnalyses:
 *                     used: 0
 *                     limit: 0
 *                     remaining: 0
 *                   chatMessages:
 *                     used: 0
 *                     limit: 0
 *                     remaining: 0
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       500:
 *         description: Failed to fetch usage statistics
 */

/**
 * @swagger
 * /subscription/cancel:
 *   post:
 *     summary: Cancel subscription
 *     description: Cancels the user's subscription. Can be set to cancel immediately or at the end of the billing period.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cancelAtPeriodEnd:
 *                 type: boolean
 *                 default: true
 *                 example: true
 *                 description: If true, cancels at period end. If false, cancels immediately.
 *     responses:
 *       200:
 *         description: Subscription canceled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Subscription will be canceled at the end of the billing period
 *                 subscription:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     plan:
 *                       type: string
 *                     status:
 *                       type: string
 *                     cancelAtPeriodEnd:
 *                       type: boolean
 *                     currentPeriodEnd:
 *                       type: string
 *                       format: date-time
 *             examples:
 *               cancelAtPeriodEnd:
 *                 summary: Cancel at period end
 *                 value:
 *                   message: Subscription will be canceled at the end of the billing period
 *                   subscription:
 *                     id: 1
 *                     plan: pro
 *                     status: active
 *                     cancelAtPeriodEnd: true
 *                     currentPeriodEnd: "2025-01-18T12:00:00.000Z"
 *               cancelImmediately:
 *                 summary: Cancel immediately
 *                 value:
 *                   message: Subscription canceled immediately
 *                   subscription:
 *                     id: 1
 *                     plan: pro
 *                     status: canceled
 *                     cancelAtPeriodEnd: false
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       500:
 *         description: Failed to cancel subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to cancel subscription
 *                 details:
 *                   type: string
 *                   example: No active subscription found
 */

/**
 * @swagger
 * /subscription/billing-portal:
 *   post:
 *     summary: Create billing portal session
 *     description: Creates a Stripe billing portal session. Returns a URL to redirect the user to manage their subscription, payment methods, and view invoices.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Billing portal session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BillingPortalSession'
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       500:
 *         description: Failed to create billing portal session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to create billing portal session
 *                 details:
 *                   type: string
 *                   example: No Stripe customer found
 */

/**
 * @swagger
 * /subscription/webhook:
 *   post:
 *     summary: Stripe webhook handler
 *     description: Receives and processes Stripe webhook events. This endpoint is called by Stripe to notify about subscription events like payment success, subscription updates, etc. Must be configured in Stripe Dashboard.
 *     tags: [Subscription]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Stripe webhook event payload
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe webhook signature for verification
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid signature or missing signature
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid signature
 *       500:
 *         description: Webhook handler failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Webhook handler failed
 */
