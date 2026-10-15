import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'KYC Onboarding API',
      version: '1.0.0',
      description: 'RESTful API for the KYC onboarding flow (identity verification).',
    },
    servers: [
      { url: 'http://localhost:5001', description: 'Local (Docker)' },
      { url: 'https://api.example.com', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // Scan both source (dev via ts-node) and compiled (Docker) route files.
  // Compiled .js retains the @swagger JSDoc because tsconfig sets removeComments: false.
  apis: ['./src/features/**/routes.ts', './dist/features/**/routes.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
