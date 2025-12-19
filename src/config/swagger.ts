// const PORT = process.env.PORT || 3001;
// VPS
const PORT = process.env.PORT || 3001;

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "HonestMM API",
      version: "1.0.0",
      description: "API documentation for HonestMM & Market Making Agreement Analyzer backend",
    },
    tags: [
      { name: "Health Check", description: "default health check api" },
      { name: "HonestMM", description: "Standard Email/OTP Authentication" },
      { name: "Social Auth", description: "Third-party OAuth providers" },
      { name: "Subscription", description: "Stripe subscription management and usage tracking" },
    ],
    servers: [
      {
        url: `/api`,
        description: "Current host with /api prefix",
      },
      {
        url: `/`,
        description: "Current host",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    "./src/docs/*.ts",
    "./src/controllers/*.ts",
    "./src/routes/*.ts",
    "./src/server.ts",
    // Include built files in production so swagger works with start:prod
    // "./dist/**/*.js"
  ],
};

export default swaggerOptions;
