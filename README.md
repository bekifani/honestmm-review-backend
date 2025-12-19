# Globx Flow Backend

A Node.js/Express backend with TypeScript, Prisma ORM, PostgreSQL, JWT authentication, OAuth (Google/Telegram), email verification, and WebSocket support.

## Prerequisites

- **Node.js** v18+ and npm
- **PostgreSQL** database (local or remote)
- **Git**

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file in the project root. Copy from `.env.example` and update with your values:

```bash
cp .env.example .env
```

#### Required Environment Variables

**Database:**
```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/template"
```
Replace `yourpassword` with your PostgreSQL password and `template` with your desired database name.

**JWT Tokens (generate secure random strings):**
```env
ACCESS_TOKEN_SECRET="your_super_secret_access_key_min_32_chars"
REFRESH_TOKEN_SECRET="your_super_secret_refresh_key_min_32_chars"
```

**Email Configuration (Gmail SMTP):**
```env
EMAIL_USER="your-email@gmail.com"
EMAIL_APP_PASS="your-gmail-app-password"
```
*Note: Use Gmail App Password, not your regular password. [Generate here](https://myaccount.google.com/apppasswords)*

**Telegram Bot:**
```env
TELEGRAM_BOT_TOKEN="your-telegram-bot-token-from-botfather"
TELEGRAM_CHAT_ID="your-telegram-chat-id-for-alerts"
TELEGRAM_APP_ID="your-telegram-app-id"
TELEGRAM_APP_SECRET="your-telegram-app-secret"
TELEGRAM_CALLBACK_URL="http://localhost:5001/auth/telegram/callback"
```

**Google OAuth:**
```env
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:5001/auth/google/callback"
```

**Frontend & Server:**
```env
FRONTEND_ORIGINS="http://localhost:5173,http://localhost:8080,http://localhost:8181"
PORT=5001
NODE_ENV="development"
CLIENT_URL="http://localhost:5173"
```

**Optional:**
```env
TRUST_PROXY="false"
ENABLE_RATE_LIMITING="true"
```

### 3. Database Setup

#### Initialize Prisma Migrations

```bash
# Format and validate schema
npx prisma format
npx prisma validate

# Create and apply initial migration
npx prisma migrate dev --name init

# Generate Prisma Client
npx prisma generate
```

#### Seed Database (Optional)

```bash
npm run seed
```

This creates a default admin user:
- **Email:** `admin@example.com`
- **Password:** `password123`

### 4. Run the Server

**Development Mode (with auto-reload):**
```bash
npm run dev
```

**Production Build & Run:**
```bash
npm run build
npm run start:prod
```

**Alternative Start:**
```bash
npm run start
```

The server will start on `http://localhost:5001` (or your configured PORT).

## API Documentation

Once the server is running, access Swagger docs at:
- `http://localhost:5001/docs`
- `http://localhost:5001/api/docs`

## Project Structure

```
src/
├── config/          # Configuration files (Prisma, Passport, Email, Swagger, Logger)
├── controllers/     # Request handlers
├── middleware/      # Express middleware (Auth, Rate Limiting, Credentials)
├── routes/          # API route definitions
├── services/        # Business logic (Auth, Email, Token, WebSocket)
├── utils/           # Utility functions (Telegram, Wallet Guard)
├── server.ts        # Express app setup
└── index.ts         # Entry point

prisma/
├── schema.prisma    # Database schema
├── seed.ts          # Database seeding script
└── migrations/      # Migration history
```

## Key Features

### Authentication
- **Email/Password:** Register, login, password reset with OTP
- **Google OAuth:** Social login via Google
- **Telegram:** Mini App & Widget authentication
- **JWT:** Access tokens (1h) + Refresh tokens (3d)
- **WebSocket:** Real-time notifications with JWT auth

### Email Verification
- Send OTP via email
- Verify email with OTP
- Password reset flow

### Authorization
- Role-based access control (USER, ADMIN)
- Protected routes with `requireAuth` middleware
- Admin-only routes with `requireAdmin` middleware

### Database
- PostgreSQL with Prisma ORM
- Models: User, RefreshToken, Otp
- Automatic migrations

## Common Commands

```bash
# Development
npm run dev              # Start with nodemon
npm run dev2             # Alternative dev start

# Production
npm run build            # Compile TypeScript
npm run start:prod       # Run compiled code
npm run clean            # Remove dist and .tsbuildinfo

# Database
npm run seed             # Seed database with dummy data
npx prisma studio       # Open Prisma Studio GUI
npx prisma migrate dev   # Create new migration
npx prisma migrate reset # Reset database (⚠️ destructive)
```

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Ensure database exists or Prisma can create it

### Migration Issues
```bash
# Reset migrations (⚠️ deletes all data)
rm -rf prisma/migrations
npx prisma migrate dev --name init

# On Windows PowerShell:
Remove-Item -Recurse -Force .\prisma\migrations
npx prisma migrate dev --name init
```

### Email Not Sending
- Verify `EMAIL_USER` and `EMAIL_APP_PASS` are correct
- Use Gmail App Password, not regular password
- Check Gmail security settings

### Telegram Bot Not Working
- Verify `TELEGRAM_BOT_TOKEN` is valid
- Check bot is active with @BotFather
- Ensure webhook/polling is configured

### WebSocket Connection Failed
- Verify `FRONTEND_ORIGINS` includes your frontend URL
- Check CORS settings in `src/server.ts`
- Ensure JWT token is passed in WebSocket handshake

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ACCESS_TOKEN_SECRET` | ✅ | JWT access token secret |
| `REFRESH_TOKEN_SECRET` | ✅ | JWT refresh token secret |
| `EMAIL_USER` | ✅ | Gmail address for sending emails |
| `EMAIL_APP_PASS` | ✅ | Gmail app password |
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | Telegram chat ID for alerts |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | ✅ | Google OAuth callback URL |
| `PORT` | ❌ | Server port (default: 5001) |
| `NODE_ENV` | ❌ | Environment (development/production) |
| `FRONTEND_ORIGINS` | ❌ | Comma-separated CORS origins |
| `CLIENT_URL` | ❌ | Frontend URL for file uploads |
| `TELEGRAM_APP_ID` | ❌ | Telegram app ID |
| `TELEGRAM_APP_SECRET` | ❌ | Telegram app secret |
| `TELEGRAM_CALLBACK_URL` | ❌ | Telegram callback URL |
| `TRUST_PROXY` | ❌ | Trust proxy headers (default: false) |
| `ENABLE_RATE_LIMITING` | ❌ | Enable rate limiting (default: true) |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/telegram` - Telegram authentication
- `GET /api/auth/logout` - Logout
- `GET /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/forgot-password` - Send password reset OTP
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/send-verification-email` - Send email verification OTP
- `POST /api/auth/verify-email` - Verify email
- `PUT /api/auth/update-password` - Update password (requires auth)

## Database Schema

### User
```prisma
model User {
  id              Int             @id @default(autoincrement())
  name            String
  email           String?         @unique
  password        String?
  username        String?
  googleId        String?         @unique
  telegramId      String?         @unique
  role            String          @default("USER")
  createdAt       DateTime        @default(now())
  isEmailVerified Boolean         @default(false)
}
```

### RefreshToken
```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  token     String
  userId    Int      @unique
  createdAt DateTime @default(now())
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id])
}
```

### Otp
```prisma
model Otp {
  id        String   @id @default(uuid())
  otp       String
  userId    Int      @unique
  createdAt DateTime @default(now())
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id])
}
```

## Security Notes

- ✅ Passwords hashed with bcryptjs (10 rounds)
- ✅ JWT tokens with expiration (access: 1h, refresh: 3d)
- ✅ HTTPS recommended in production
- ✅ Rate limiting on auth endpoints
- ✅ CORS configured for specified origins
- ✅ Helmet for security headers
- ✅ Role-based access control (RBAC)
- ⚠️ Never commit `.env` to version control

## Support

For issues or questions, check the logs:
```bash
# View server logs
npm run dev

# Check Prisma logs
npx prisma generate --verbose
```

## License

ISC

---

**Last Updated:** December 2025
