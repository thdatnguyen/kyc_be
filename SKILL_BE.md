# Reusable Backend Development Skills & Patterns

> A practical reference of reusable backend patterns, architecture decisions, and implementation recipes applicable to any Node.js/Express/TypeScript REST API project.

---

## Table of Contents

1. [Project Structure & Architecture](#1-project-structure--architecture)
2. [TypeScript & Environment Setup](#2-typescript--environment-setup)
3. [Express App Setup & Middleware Pipeline](#3-express-app-setup--middleware-pipeline)
4. [Authentication System](#4-authentication-system)
5. [Role-Based Access Control (RBAC)](#5-role-based-access-control-rbac)
6. [API Validation (Zod)](#6-api-validation-zod)
7. [Standardized API Responses](#7-standardized-api-responses)
8. [Centralized Error Handling](#8-centralized-error-handling)
9. [Database Setup (Mongoose + MongoDB)](#9-database-setup-mongoose--mongodb)
10. [Logging System (Winston + Morgan)](#10-logging-system-winston--morgan)
11. [File Upload (Multer + Cloudinary)](#11-file-upload-multer--cloudinary)
12. [Security Patterns](#12-security-patterns)
13. [Testing Strategy](#13-testing-strategy)
14. [Docker & Deployment](#14-docker--deployment)
15. [API Documentation (Swagger)](#15-api-documentation-swagger)
16. [Business Logic Patterns](#16-business-logic-patterns)
17. [Swagger/OpenAPI Integration](#17-swaggeropenapi-integration)
18. [Seed / Migration Strategy](#18-seed--migration-strategy)

---

## 1. Project Structure & Architecture

### Pattern: Feature-First + Clean Architecture + MVC

```
src/
├── server.ts                    # Entry point: DB connect → start server → graceful shutdown
├── app.ts                       # Express app factory: apply global middleware, mount routes
├── core/                        # Shared infrastructure (framework-agnostic)
│   ├── config/                  # env, db connection, logger, swagger
│   ├── middlewares/             # auth, rbac, validation, upload, error handler
│   └── utils/                   # jwt helper, cloudinary, response formatter
├── features/                    # Self-contained feature modules
│   └── <feature>/
│       ├── models/              # Mongoose schemas (persistence layer)
│       ├── schemas/             # Zod validation schemas (API boundary)
│       ├── services/            # Business logic (stateless, testable)
│       ├── controllers/         # Thin Express handlers (delegate to services)
│       └── routes.ts            # Router + Swagger JSDoc annotations
└── __tests__/                   # Mirrors src/ structure
```

### Key Rules

- Each feature is **self-contained** — all layers co-located
- `core/` contains **shared infrastructure** only — no feature-specific logic
- Controllers are **thin** — only parse request, call service, format response, catch errors
- Services are **stateless** — no reference to `req`/`res`, no HTTP context
- Schemas (Zod) are separate from Models (Mongoose) — different layers, different concerns

### Why This Structure?

- **Scalable**: New features are added as new folders under `features/` without touching `core/`
- **Testable**: Services can be unit-tested independently without HTTP context
- **Discoverable**: A developer can understand a feature by reading one folder
- **Decoupled**: Business logic doesn't depend on Express, controllers don't depend on Mongoose

---

## 2. TypeScript & Environment Setup

### tsconfig.json Essentials

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@core/*": ["./src/core/*"],
      "@features/*": ["./src/features/*"],
      "@app": ["./src/app"]
    }
  }
}
```

### Path Aliases

Path aliases keep imports clean and refactor-safe:

```typescript
// ❌ Relative imports (fragile on refactor)
import { logger } from '../../../core/config/logger';
import { authMiddleware } from '../../core/middlewares/authMiddleware';

// ✅ Path alias imports (stable)
import { logger } from '@core/config/logger';
import { authMiddleware } from '@core/middlewares/authMiddleware';
```

**Required packages**: `tsc-alias` (resolve aliases in compiled output) + `tsconfig-paths` (runtime resolution for ts-node).

### Typed Environment Variables

Always create a **typed env config** rather than accessing `process.env` directly:

```typescript
// src/core/config/env.ts
import dotenv from 'dotenv';

// Support ENV_FILE override for different environments
dotenv.config({ path: process.env.ENV_FILE || '.env' });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/mydb',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_dev_secret_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_change_in_production',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  LOG_DIR: process.env.LOG_DIR,
} as const;
```

**Rules:**
- One place for all env vars → no scattered `process.env` access
- Provide sensible dev defaults (but mark them as insecure if applicable)
- Support `ENV_FILE` override for multi-environment config (dev.env, .env.test)
- Docker: inject vars via `env_file` or platform dashboard, skip dotenv file loading

---

## 3. Express App Setup & Middleware Pipeline

### app.ts Pattern

The app setup should be a **factory function** (returning the Express app, not binding to a port) — this enables Supertest testing without needing a running server.

```typescript
// src/app.ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { env } from './core/config/env';
import { logger } from './core/config/logger';
import { errorHandler } from './core/middlewares/errorHandler';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './core/config/swagger';

export function createApp() {
  const app = express();

  // 1. Security headers
  app.use(helmet());

  // 2. CORS — whitelist from env, support comma-separated origins
  const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));

  // 3. Body parsing (with size limits)
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // 4. Rate limiting (skip in test to avoid interference)
  if (env.NODE_ENV !== 'test') {
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,  // 15 minutes
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use('/api', globalLimiter);

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
    });
    app.use('/api/auth', authLimiter);
  }

  // 5. HTTP request logging (skip in test)
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('combined', {
      stream: { write: (message: string) => logger.info(message.trim()) }
    }));
  }

  // 6. Health check (before auth middleware)
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'Server is up and running', timestamp: new Date().toISOString() });
  });

  // 7. Swagger docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

  // 8. Feature routes
  app.use('/api/auth', authRoutes);
  app.use('/api', procurementRoutes);
  app.use('/api/upload', uploadRoutes);

  // 9. 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  // 10. Centralized error handler (must be last)
  app.use(errorHandler);

  return app;
}
```

### server.ts Pattern

```typescript
// src/server.ts
import { createApp } from './app';
import { env } from './core/config/env';
import { connectDB } from './core/config/db';
import { logger } from './core/config/logger';

async function startServer() {
  try {
    await connectDB();
    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await mongoose.disconnect();
        logger.info('Server closed');
        process.exit(0);
      });
      // Force exit after 10s if connections don't close
      setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
```

### Middleware Pipeline Order (Critical)

The order matters — each middleware can affect subsequent ones:

```
1. helmet          → Security headers (before any response)
2. cors            → Origin check (before any route matching)
3. body parsers    → Must be before any route that reads req.body
4. rate limiters   → Before routes, after body parsing
5. morgan          → Log requests (before business logic)
6. health check    → No auth needed, before auth middleware
7. swagger docs    → No auth needed
8. feature routes  → Protected by authMiddleware inside route files
9. 404 catch-all   → After all valid routes
10. error handler   → Must be the LAST middleware (catches all errors)
```

---

## 4. Authentication System

### JWT Dual-Token Strategy

Use **two tokens** for better security and UX:

| Token          | Lifetime | Storage        | Compromise Mitigation          |
|----------------|----------|----------------|--------------------------------|
| Access Token   | Short (7d) | Client memory  | Blacklist on logout            |
| Refresh Token  | Long (30d) | DB (hashed)    | Rotate on each use             |

### JWT Helper

```typescript
// src/core/utils/jwtHelper.ts
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';  // for jti claim
import { env } from '@core/config/env';

interface TokenPayload {
  userId: string;
  role?: string;
  jti: string;
}

export function signToken(payload: Omit<TokenPayload, 'jti'>): string {
  return jwt.sign(
    { ...payload, jti: uuidv4() },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign(
    { userId, jti: uuidv4() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN, algorithm: 'HS256' }
  );
}

export function verifyRefreshToken(token: string): { userId: string; jti: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as any;
}
```

**Key security details:**
- Access token and refresh token use **different secrets**
- Every token has a `jti` (JWT ID) — a UUID for unique identification
- `jti` enables token blacklisting (per-token revocation)

### Token Blacklist (Logout)

Even stateless JWT tokens can be revoked:

```typescript
// BlacklistedToken model
const BlacklistedTokenSchema = new mongoose.Schema({
  jti:         { type: String, required: true, unique: true, index: true },
  expiresAt:   { type: Date, required: true },
}, { timestamps: true });

// TTL index: auto-delete when token naturally expires
BlacklistedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

**On logout:**
```typescript
// Store jti with the token's own expiry → auto-cleanup by MongoDB TTL index
await BlacklistedToken.create({
  jti: decoded.jti,
  expiresAt: new Date(decoded.exp * 1000),
});
// Clear stored refresh token
user.refreshToken = undefined;
await user.save();
```

### Refresh Token Rotation

Why rotate? If a refresh token is stolen, the legitimate user and attacker will both try to use it. Rotation detects this:

```typescript
async function refreshAccessToken(refreshToken: string) {
  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.userId).select('+refreshToken');

  // Compare incoming token with stored token
  if (!user || user.refreshToken !== refreshToken) {
    // Token reuse detected → possible theft → invalidate ALL sessions
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }
    throw new AuthError('Invalid refresh token');
  }

  // Issue new pair (invalidates old refresh token)
  const newAccessToken = signToken({ userId: user._id.toString(), role: user.role });
  const newRefreshToken = signRefreshToken(user._id.toString());
  user.refreshToken = newRefreshToken;
  await user.save();

  return { token: newAccessToken, refreshToken: newRefreshToken };
}
```

### Auth Middleware

```typescript
// src/core/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@core/utils/jwtHelper';
import { BlacklistedToken } from '@features/auth/models/BlacklistedToken';

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        jti: string;
        exp: number;
      };
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Check if token is blacklisted (logged out)
    const isBlacklisted = await BlacklistedToken.exists({ jti: decoded.jti });
    if (isBlacklisted) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      jti: decoded.jti,
      exp: decoded.exp!,
    };

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}
```

### Password Reset Flow

```typescript
// Generate cryptographically secure random token
const rawToken = crypto.randomBytes(32).toString('hex');  // 64-char hex

// Store SHA256 hash in DB (not raw token)
const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

user.resetPasswordToken = hashedToken;
user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);  // 15 min
await user.save({ validateBeforeSave: false });

// In production: send rawToken via email
// In dev/test: return rawToken in response body for testing
```

**Rules:**
- **Never store raw reset tokens** in DB — always hash them
- Set expiration (15 min is standard)
- Invalidate all sessions on password reset (clear `refreshToken`)
- Prevent user enumeration: return same message whether email exists or not

---

## 5. Role-Based Access Control (RBAC)

### Factory Pattern Middleware

```typescript
// src/core/middlewares/rbacMiddleware.ts
import { Request, Response, NextFunction } from 'express';

type Role = 'Admin' | 'Manager' | 'Staff';

export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}
```

### Usage in Routes

```typescript
// routes.ts — RBAC is applied per-route
router.post('/invoices',     authMiddleware,                                       createInvoice);
router.get('/invoices',      authMiddleware,                                       listInvoices);
router.delete('/invoices/:id', authMiddleware, requireRole(['Admin', 'Manager']),  deleteInvoice);

// Admin-only routes
router.get('/users',         authMiddleware, requireRole(['Admin']),               listUsers);
```

### Roles Matrix Pattern

Document roles in a matrix table (for README and team reference):

| Role      | Customers         | Invoices          | Unit Prices       | Users     | Upload            |
|-----------|-------------------|-------------------|-------------------|-----------|-------------------|
| Admin     | CRUD + Delete     | CRUD + Delete     | CRUD + Delete     | Full CRUD | Upload + Delete   |
| Manager   | CRUD + Delete     | CRUD + Delete     | CRUD + Delete     | None      | Upload only       |
| Staff     | CRUD (no delete)  | CRUD (no delete)  | CRUD (no delete)  | None      | Upload only       |

---

## 6. API Validation (Zod)

### Why Zod at the API Boundary?

- Mongoose handles **DB schema** validation (persistence layer)
- Zod handles **API input** validation (HTTP boundary)
- Different layers, different concerns, different error formats
- Zod provides coercion (query string `"20"` → number `20`) and transformation (email → lowercase)

### Generic Validation Middleware Factory

```typescript
// src/core/middlewares/validateResource.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError, AnyZodObject, ZodOptional } from 'zod';

interface ValidationSchemas {
  body?: AnyZodObject | ZodOptional<AnyZodObject>;
  query?: AnyZodObject | ZodOptional<AnyZodObject>;
  params?: AnyZodObject | ZodOptional<AnyZodObject>;
}

export function validateResource(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          error: errors,
        });
      }
      next(error);
    }
  };
}
```

### Schema Examples

```typescript
// Registration schema — with transforms
export const registerSchema = z.object({
  body: z.object({
    email: z.string()
      .email('Invalid email format')
      .transform(v => v.toLowerCase().trim()),
    password: z.string()
      .min(6, 'Password must be at least 6 characters')
      .max(128, 'Password must not exceed 128 characters'),
    name: z.string()
      .max(200, 'Name must not exceed 200 characters')
      .transform(v => v.trim())
      .optional(),
    phone: z.string()
      .max(20, 'Phone must not exceed 20 characters')
      .transform(v => v.trim())
      .optional(),
    avatarUrl: z.string()
      .url('Invalid URL format')
      .max(500)
      .optional(),
  }),
});

// Query schema with coercion and defaults
export const getInvoicesQuerySchema = z.object({
  query: z.object({
    skip:    z.coerce.number().int().min(0).default(0),
    top:     z.coerce.number().int().min(1).max(100).default(20),
    sortBy:  z.enum(['entryDate', 'invoiceId', 'totalAmount', 'createdAt']).default('entryDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    from:    z.coerce.date().optional(),
    to:      z.coerce.date().optional(),
    customerId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId').optional(),
    search:  z.string().trim().optional(),
  }),
});

// Param schema
export const invoiceIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId format'),
  }),
});
```

### Usage in Routes

```typescript
router.post('/register',   validateResource(registerSchema),             authController.register);
router.post('/invoices',   authMiddleware, validateResource(createInvoiceSchema), invoiceController.create);
router.get('/invoices',    authMiddleware, validateResource(getInvoicesQuerySchema), invoiceController.list);
router.get('/invoices/:id', authMiddleware, validateResource(invoiceIdParamSchema), invoiceController.getById);
```

---

## 7. Standardized API Responses

### Response Formatter

Every API response should follow the same shape — this simplifies frontend integration:

```typescript
// src/core/utils/responseFormatter.ts
import { Response } from 'express';

interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: any;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, message?: string) {
  const response: ApiResponse<T> = { success: true, data };
  if (message) response.message = message;
  return res.status(statusCode).json(response);
}

export function sendError(res: Response, message: string, statusCode = 500, error?: any) {
  const response: ApiResponse = { success: false, message };
  if (error && process.env.NODE_ENV !== 'production') response.error = error;
  return res.status(statusCode).json(response);
}
```

**Usage in controllers:**
```typescript
// Success
return sendSuccess(res, { user, token, refreshToken }, 201, 'User registered successfully');

// Error
return sendError(res, 'Customer not found', 404);
```

### Response Contract

```json
// Success
{ "success": true,  "message": "...",  "data": { ... } }

// Error
{ "success": false, "message": "...",  "error": { ... } }  // error only in non-production
```

---

## 8. Centralized Error Handling

### Error Handler Pattern

Map specific error types to HTTP status codes in one place:

```typescript
// src/core/middlewares/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import mongoose from 'mongoose';
import { logger } from '@core/config/logger';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  // Log the error
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // JWT errors
  if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
    return res.status(401).json({
      success: false,
      message: err instanceof TokenExpiredError ? 'Token has expired' : 'Invalid token',
    });
  }

  // Mongoose duplicate key
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
    });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // Custom errors with statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Generic 500
  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    success: false,
    message: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { error: err.stack }),
  });
}
```

### Throwing Custom Errors

```typescript
// In services, throw errors with statusCode for the errorHandler to pick up
throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
throw Object.assign(new Error('Email is already in use'), { statusCode: 409 });
throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
throw Object.assign(new Error('Admin user already exists'), { statusCode: 403 });
```

---

## 9. Database Setup (Mongoose + MongoDB)

### Connection with Pooling

```typescript
// src/core/config/db.ts
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGO_DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info('Connected to MongoDB');

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', { error: err });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
  } catch (error) {
    logger.error('Failed to connect to MongoDB', { error });
    process.exit(1);
  }
}
```

### Model Pattern

```typescript
// Mongoose model with:
// - Schema validation (DB-level constraints)
// - Indexes (query performance)
// - toJSON transform (remove _id, __v, password)
// - select:false for sensitive fields

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,   // Never returned in queries by default
  },
  role: {
    type: String,
    enum: ['Admin', 'Manager', 'Staff'],
    default: 'Staff',
  },
  refreshToken: {
    type: String,
    select: false,
  },
  resetPasswordToken: {
    type: String,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    select: false,
  },
}, { timestamps: true });

// Remove sensitive/internal fields from JSON output
userSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

// Index for performance
userSchema.index({ email: 1 });

export const User = mongoose.model('User', userSchema);
```

### TTL Index Pattern (Auto-Expiring Documents)

Useful for token blacklists, OTP codes, temporary data:

```typescript
// Document will be auto-deleted when expiresAt is reached
blacklistedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

### Selecting Hidden Fields

```typescript
// When you need a normally-hidden field, use .select('+fieldName')
const user = await User.findById(id).select('+password +refreshToken');
```

---

## 10. Logging System (Winston + Morgan)

### Winston Logger Setup

```typescript
// src/core/config/logger.ts
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { env } from './env';

// Auto-create log directory
const logDir = env.LOG_DIR || path.join(__dirname, '..', '..', '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const isProduction = env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    // All logs to combined.log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024,   // 5 MB rotation
      maxFiles: 5,
    }),
    // Errors only to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// Console transport for development (colorized, not JSON)
if (!isProduction) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }));
}
```

### Morgan → Winston Pipe

```typescript
// In app.ts
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// Skip in test environment to reduce noise
if (env.NODE_ENV !== 'test') {
  app.use(morgan(...));
}
```

---

## 11. File Upload (Multer + Cloudinary)

### Multer Middleware (Memory Storage)

Always use **memory storage** when uploading to cloud services — never write to disk:

```typescript
// src/core/middlewares/uploadMiddleware.ts
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    // Only allow image MIME types
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadSingle = upload.single('image');
```

### Cloudinary Stream Upload

```typescript
// src/core/utils/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';
import { env } from '@core/config/env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export function uploadToCloudinary(file: Express.Multer.File): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: env.CLOUDINARY_FOLDER || 'default' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result!.secure_url, publicId: result!.public_id });
      }
    );
    uploadStream.end(file.buffer);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
```

---

## 12. Security Patterns

### Complete Security Checklist for Express APIs

```typescript
// 1. Security Headers — always first middleware
app.use(helmet());

// 2. CORS — whitelist specific origins, never use '*'
app.use(cors({
  origin: env.CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true,
}));

// 3. Request Body Size Limit — prevent large payload attacks
app.use(express.json({ limit: '10kb' }));

// 4. Rate Limiting — two tiers
//    Global: 100 requests per 15 min
//    Auth:   10 requests per 15 min (prevent brute-force)
const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 100 });
const authLimiter    = rateLimit({ windowMs: 15*60*1000, max: 10 });

// 5. Password Hashing — bcrypt with adequate rounds
const SALT_ROUNDS = 12;  // 10-12 is standard for 2024
const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

// 6. JWT — different secrets for access and refresh tokens
//    JWT_SECRET != JWT_REFRESH_SECRET

// 7. No Raw Queries — always use Mongoose ODM (prevents NoSQL injection)

// 8. Error Masking — never leak stack traces in production
const isProduction = env.NODE_ENV === 'production';
res.status(500).json({
  message: isProduction ? 'Internal server error' : err.message,
});

// 9. User Enumeration Prevention — generic messages
//    Login:  "Invalid email or password" (not "Email not found")
//    Reset:  "If email exists, reset token sent" (not "Email not found")

// 10. Graceful Shutdown — handle SIGTERM/SIGINT
process.on('SIGTERM', shutdown);

// 11. Non-root Docker User
//    Dockerfile: USER appuser (uid 1001)

// 12. Sanitize Response — never return password, reset tokens, etc.
userSchema.set('toJSON', { transform: removeSensitiveFields });
```

### User Enumeration Prevention

```typescript
// ❌ Don't reveal whether email exists
if (!user) return res.status(404).json({ message: 'Email not found' });

// ✅ Always return the same generic message
if (!user || !(await bcrypt.compare(password, user.password))) {
  return res.status(401).json({ message: 'Invalid email or password' });
}
```

---

## 13. Testing Strategy

### Test Stack

| Component    | Tool                        | Why                                            |
|--------------|-----------------------------|------------------------------------------------|
| Runner       | Jest 29 + ts-jest           | TypeScript support, fast, widely used          |
| HTTP Testing | Supertest 7                 | Tests Express app directly (no server listen)  |
| DB Isolation | mongodb-memory-server       | Real MongoDB in-memory, zero config, isolated  |

### Test File Structure (Mirror src/)

```
src/__tests__/
├── envSetup.ts                        # Jest setupFiles: env vars before module loading
├── setup.ts                           # DB lifecycle (beforeAll/afterAll/afterEach)
├── core/
│   ├── utils/
│   │   └── jwtHelper.test.ts          # Unit: utility tests
│   └── middlewares/
│       ├── authMiddleware.test.ts     # Unit: middleware tests
│       ├── rbacMiddleware.test.ts
│       ├── validateResource.test.ts
│       └── errorHandler.test.ts
└── features/
    ├── auth/
    │   ├── authService.test.ts        # Unit: business logic tests
    │   └── auth.integration.test.ts   # Integration: full API flow
    └── procurement/
        ├── customerService.test.ts
        ├── invoiceService.test.ts
        └── procurement.integration.test.ts
```

### Test Setup for In-Memory MongoDB

```typescript
// src/__tests__/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean all collections between tests for isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
```

### Unit Test Pattern (Service)

```typescript
// Test business logic in isolation — no HTTP, no DB (or in-memory DB)
describe('authService.registerUser', () => {
  it('should assign Admin role to the first user', async () => {
    const result = await authService.registerUser({
      email: 'admin@test.com',
      password: 'password123',
    });
    expect(result.user.role).toBe('Admin');
  });

  it('should assign Staff role to subsequent users', async () => {
    await authService.registerUser({ email: 'admin@test.com', password: 'password123' });
    const result = await authService.registerUser({
      email: 'staff@test.com',
      password: 'password123',
    });
    expect(result.user.role).toBe('Staff');
  });

  it('should reject duplicate emails', async () => {
    await authService.registerUser({ email: 'user@test.com', password: 'password123' });
    await expect(
      authService.registerUser({ email: 'user@test.com', password: 'password123' })
    ).rejects.toThrow('Email is already in use');
  });
});
```

### Integration Test Pattern (Supertest)

```typescript
import request from 'supertest';
import { createApp } from '@app';

const app = createApp();

describe('POST /api/auth/register', () => {
  it('should register a new user and return tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe('Admin');  // first user = Admin
  });
});
```

### Env Setup for Tests

```typescript
// src/__tests__/envSetup.ts — runs BEFORE any module loads
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
```

### Jest Configuration

```typescript
// jest.config.ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/envSetup.ts'],
  setupFilesAfterFramework: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '@core/(.*)': '<rootDir>/src/core/$1',
    '@features/(.*)': '<rootDir>/src/features/$1',
    '@app': '<rootDir>/src/app',
  },
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
```

---

## 14. Docker & Deployment

### Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
USER appuser
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1
CMD ["node", "dist/server.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:8
    container_name: mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh --quiet
      interval: 10s
      retries: 5

  api:
    build: .
    container_name: api-server
    ports:
      - "5001:5000"
    env_file:
      - dev.env
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - app-network

volumes:
  mongo_data:

networks:
  app-network:
    driver: bridge
```

### Railway Deployment

```toml
# railway.toml
[build]
builder = "DOCKERFILE"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
maxRetries = 10
```

### Multi-Environment Env Files

```
dev.env          → Development (Docker Compose) — safe to commit, dev defaults only
.env             → Production / Local host — gitignored, contains real secrets
.env.example     → Template — committed, placeholder values only
```

---

## 15. Pagination, Filtering & Search

### Standard Query Parameters (for list endpoints)

| Param       | Type     | Default     | Purpose                                |
|-------------|----------|-------------|----------------------------------------|
| `skip`      | integer  | 0           | Records to skip (cursor-based offset)  |
| `top`       | integer  | 20          | Records to return (max limit enforced) |
| `sortBy`    | string   | depends     | Field to sort by                       |
| `sortOrder` | string   | desc        | asc or desc                            |
| `from`      | date     | —           | Filter from date                       |
| `to`        | date     | —           | Filter to date                         |
| `search`    | string   | —           | Free-text search across fields         |

### Service Implementation

```typescript
async function listInvoices(query: InvoiceQuery) {
  const { skip = 0, top = 20, sortBy = 'entryDate', sortOrder = 'desc', from, to, customerId, search } = query;

  // Build filter
  const filter: any = {};
  if (from || to) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
  }
  if (customerId) filter.customer = customerId;

  // Text search across multiple fields
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { invoiceId: searchRegex },
      // Need to join with customer collection for businessName search
    ];
  }

  const [invoices, count] = await Promise.all([
    Invoice.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(top)
      .populate('customer'),
    Invoice.countDocuments(filter),
  ]);

  return { invoices, count };
}
```

### KPI Aggregation Pattern (MongoDB Aggregation Pipeline)

For dashboard/reporting endpoints that need aggregated data:

```typescript
const [kpiResult] = await Invoice.aggregate([
  { $match: filter },
  {
    $group: {
      _id: null,
      totalInvoices: { $sum: 1 },
      avgNetWeight: { $avg: '$netWeight' },
      avgZem: { $avg: '$zem' },
      avgMoisture: { $avg: '$moisture' },
      avgImpurity: { $avg: '$impurity' },
      avgUnitPrice: { $avg: '$unitPrice' },
      totalStandardizedWeight: { $sum: '$standardizedWeight' },
      totalAmount: { $sum: '$totalAmount' },
    },
  },
]);

// Return zeroed defaults if no results
const kpis = kpiResult || {
  totalInvoices: 0, avgNetWeight: 0, avgZem: 0,
  avgMoisture: 0, avgImpurity: 0, avgUnitPrice: 0,
  totalStandardizedWeight: 0, totalAmount: 0,
};
```

---

## 16. Business Logic Patterns

### Server-Side Recalculation (Financial Data Integrity)

Never trust client-submitted derived values. Always recalculate on the server:

```typescript
async function createInvoice(input: CreateInvoiceInput) {
  // 1. Validate external references
  const customer = await Customer.findById(input.customer);
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });

  // 2. Recalculate ALL derived fields (discard client values)
  const derivedMetrics = calculateDerivedMetrics(input);

  // 3. Persist with server-calculated values
  const invoice = await Invoice.create({
    ...input,
    ...derivedMetrics,  // Override whatever client sent
  });

  return invoice.populate('customer');
}

function calculateDerivedMetrics(input: RawInvoiceInput) {
  const netWeight = input.totalWeight - input.tare;

  let totalAdjustment: number;
  if (input.category === 'pepper') {
    totalAdjustment = ((input.zem - 500) * 0.1) + (15 - input.moisture) + (1 - input.impurity);
  } else if (input.moisture >= 15) {
    totalAdjustment = lookupMoistureDeductionTable(input.moisture) + (1 - input.impurity);
  } else {
    totalAdjustment = ((15 - input.moisture) / 2) + (1 - input.impurity);
  }

  const addedWeight = Math.round((totalAdjustment * netWeight) / 100 * 10) / 10;  // 1 decimal
  const standardizedWeight = Math.round((netWeight + addedWeight) * 10) / 10;
  const totalAmount = Math.round((standardizedWeight * input.unitPrice) / 1000) * 1000;  // nearest 1000

  return { netWeight, totalAdjustment, addedWeight, standardizedWeight, totalAmount };
}
```

### First-User Admin Pattern

Ensure the system always has an admin without needing seed scripts:

```typescript
async function registerUser(input: RegisterInput) {
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) throw Object.assign(new Error('Email is already in use'), { statusCode: 409 });

  const userCount = await User.countDocuments();
  const hasAdmin = await User.exists({ role: 'Admin' });

  let role = 'Staff';
  if (userCount === 0) {
    role = 'Admin';  // First user = Admin
  } else if (input.role === 'Admin' && hasAdmin) {
    throw Object.assign(new Error('Admin user already exists'), { statusCode: 403 });
  } else if (input.role) {
    role = input.role;  // Admin can set role for new users
  }

  const hashedPassword = await bcrypt.hash(input.password, 12);
  const user = await User.create({ ...input, password: hashedPassword, role });

  return user;
}
```

---

## 17. Swagger/OpenAPI Integration

### Swagger Config

```typescript
// src/core/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';

const isProduction = process.env.NODE_ENV === 'production';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Project API',
      version: '1.0.0',
      description: 'RESTful API documentation',
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Development' },
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
  apis: [
    // Use correct path for dev vs production
    isProduction ? './dist/features/**/routes.js' : './src/features/**/routes.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
```

### Swagger JSDoc Annotations (in routes.ts)

```typescript
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: Email already exists
 */
router.post('/register', validateResource(registerSchema), authController.register);
```

---

## 18. Seed / Migration Strategy

### Application-Level Seeding (No Separate Seed Script)

Instead of seed scripts, use **application logic** for initial setup:

```typescript
// First user pattern (no seed script needed)
if (userCount === 0) {
  role = 'Admin';  // First registered user becomes Admin automatically
}
```

This approach:
- No separate seed scripts to maintain
- No risk of seed data going stale
- Works automatically in any environment (dev, test, production)

### Mongoose Auto-Creation (No Migration Framework)

Mongoose auto-creates collections on first write if they don't exist. For schema changes:

- **Development**: Drop and recreate collections manually
- **Production**: Use MongoDB's schema-less nature for backward-compatible additions
- **Breaking changes**: Manual migration scripts or database versioning

---

## Summary: Reusable Architecture Decisions

| Decision                              | Why                                                                 |
|---------------------------------------|---------------------------------------------------------------------|
| Feature-First structure               | Scalable, discoverable, self-contained modules                      |
| Service layer (stateless)             | Testable without HTTP context, reusable across controllers           |
| Zod for API validation                | Coercion, transforms, field-level errors, separate from DB layer    |
| JWT dual-token + blacklist            | Revocable access tokens, refresh token rotation detects theft       |
| TTL index for blacklist               | Auto-cleanup, no cron jobs needed                                   |
| Memory storage for file uploads       | No disk I/O, direct stream to Cloudinary                            |
| Server-side recalculation             | Prevents client manipulation of financial/derived data              |
| Error handler mapping all error types | Single place for error-to-status mapping, consistent error format   |
| Response formatter                    | Consistent API contract: { success, data, message, error }          |
| App factory pattern                   | Supertest can test without server listen                            |
| Graceful shutdown                     | 10s timeout for in-flight requests, clean DB disconnect             |
| Multi-stage Docker build              | Smaller production image, non-root user, healthcheck                |
| In-memory DB for tests                | Zero config, isolated tests, no external DB dependency              |
| First-user admin (no seed script)     | Self-bootstrapping, works in any environment                        |
| Different secrets per token type      | Compromised access token doesn't compromise refresh tokens          |
| SHA256-hash reset tokens              | Never store raw reset tokens in DB                                  |
