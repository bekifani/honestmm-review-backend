/**
 * @swagger
 * tags:
 *   - name: HonestMM
 *     description: Standard Email/OTP Authentication
 *   - name: Social Auth
 *     description: Third-party OAuth providers
 */

/**
 * @swagger
 * /auth/email:
 *   post:
 *     summary: Initiate Email Login/Signup (Send OTP)
 *     description: Sends a verification OTP to the provided email. Used for both registration and login.
 *     tags: [HonestMM]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       204:
 *         description: OTP sent successfully
 *       400:
 *         description: Invalid email
 */

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP and Login
 *     description: Verifies the OTP sent to the email. If correct, returns auth tokens and user data.
 *     tags: [HonestMM]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string }
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Invalid OTP or expired
 */

/**
 * @swagger
 * /auth/refresh-token:
 *   get:
 *     summary: Issue new access token from refresh cookie
 *     tags: [HonestMM]
 *     responses:
 *       200:
 *         description: New access token
 */

/**
 * @swagger
 * /auth/logout:
 *   get:
 *     summary: Logout and clear refresh token cookie
 *     tags: [HonestMM]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */

/**
 * @swagger
 * /auth/twitter:
 *   get:
 *     summary: Initiate Twitter OAuth
 *     description: Redirects to Twitter for authentication.
 *     tags: [Social Auth]
 *     responses:
 *       302:
 *         description: Redirect to Twitter OAuth
 */

/**
 * @swagger
 * /auth/twitter/callback:
 *   get:
 *     summary: Twitter OAuth callback
 *     description: Completes Twitter OAuth; issues access and refresh tokens, sets refresh cookie, then redirects or returns JSON.
 *     tags: [Social Auth]
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Authentication failed
 */

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Initiate Google OAuth
 *     description: Redirects to Google for authentication.
 *     tags: [Social Auth]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     description: Completes Google OAuth; issues access and refresh tokens, sets refresh cookie, then redirects to the frontend or returns JSON.
 *     tags: [Social Auth]
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Authentication failed
 */

/**
 * @swagger
 * /auth/telegram:
 *   get:
 *     summary: Authenticate via Telegram
 *     description: Validates Telegram init data and returns JWT access token and user. Sets refresh token cookie.
 *     tags: [Social Auth]
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Invalid initData or signature
 */
