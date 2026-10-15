import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { User } from '@features/auth/models/User';
import { BlacklistedToken } from '@features/auth/models/BlacklistedToken';
import { LoginAttempt } from '@features/auth/models/LoginAttempt';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@core/utils/jwtHelper';
import { conflict, unauthorized, forbidden, AppError } from '@core/utils/appError';
import { log } from '@core/config/logger';
import { maskEmail } from '@core/utils/mask';
import { env } from '@core/config/env';
import { Role } from '@core/types';

const SALT_ROUNDS = 12;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

interface RegisterInput {
  email: string;
  password: string;
}

interface AuthResult {
  user: Record<string, unknown>;
  token: string;
  refreshToken: string;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    log('warn', 'Registration failed: email already in use', { email: maskEmail(input.email) });
    throw conflict('Email is already in use');
  }

  const userCount = await User.countDocuments();

  let role: Role = 'Applicant';
  if (userCount === 0) {
    role = 'Admin'; // first user bootstraps the system as Admin
  }

  const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await User.create({ email: input.email, password: hashedPassword, role });

  log('info', 'User registered', {
    userId: user._id.toString(),
    role,
    email: maskEmail(input.email),
  });

  return issueTokens(user._id.toString(), user.role);
}

export async function login(input: RegisterInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();
  const emailHash = sha256(email);

  // Account-level lockout (keyed on email hash, NOT IP) — defeats credential
  // stuffing even when the attacker rotates IPs via VPN/proxies.
  const attempt = await LoginAttempt.findOne({ emailHash });
  if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > Date.now()) {
    log('warn', 'Login blocked: too many failed attempts', { email: maskEmail(email) });
    throw new AppError('Too many failed attempts, please try again later', 429);
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    await recordFailedLogin(emailHash);
    log('warn', 'Login failed: unknown email', { email: maskEmail(email) });
    throw unauthorized('Invalid email or password');
  }

  const valid = await bcrypt.compare(input.password, user.password);
  if (!valid) {
    await recordFailedLogin(emailHash);
    log('warn', 'Login failed: invalid password', {
      userId: user._id.toString(),
      email: maskEmail(email),
    });
    throw unauthorized('Invalid email or password');
  }

  // Success: clear any accumulated failures.
  await LoginAttempt.deleteOne({ emailHash });

  log('info', 'User logged in', {
    userId: user._id.toString(),
    role: user.role,
    email: maskEmail(email),
  });

  return issueTokens(user._id.toString(), user.role);
}

/**
 * Increment the failed-login counter for an email (existing or not). Once the
 * threshold is reached the email is locked for LOGIN_LOCK_MS — identically for
 * real and unknown emails, so the response never reveals account existence.
 */
async function recordFailedLogin(emailHash: string): Promise<void> {
  const attempt = await LoginAttempt.findOne({ emailHash });
  if (!attempt) {
    await LoginAttempt.create({
      emailHash,
      attempts: 1,
      lockedUntil: null,
      expiresAt: new Date(Date.now() + env.LOGIN_ATTEMPT_TTL_MS),
    });
    return;
  }

  attempt.attempts += 1;
  if (attempt.attempts >= env.LOGIN_MAX_ATTEMPTS) {
    attempt.lockedUntil = new Date(Date.now() + env.LOGIN_LOCK_MS);
    attempt.attempts = 0;
  }
  attempt.expiresAt = new Date(Date.now() + env.LOGIN_ATTEMPT_TTL_MS);
  await attempt.save();
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.userId).select('+refreshToken');

  if (!user) throw unauthorized('Invalid refresh token');

  const storedHash = user.refreshToken;
  const incomingHash = sha256(refreshToken);

  if (!storedHash || storedHash !== incomingHash) {
    // Reuse detected → possible theft → invalidate all sessions for this user.
    if (user) {
      log('warn', 'Refresh token reuse detected — invalidating sessions', {
        userId: decoded.userId,
      });
      user.refreshToken = undefined;
      await user.save();
    }
    throw unauthorized('Invalid refresh token');
  }

  return issueTokens(user._id.toString(), user.role);
}

export async function logout(input: { userId: string; jti: string; exp: number }): Promise<void> {
  // Blacklist the access token until its natural expiry (TTL index cleans it up).
  await BlacklistedToken.create({
    jti: input.jti,
    expiresAt: new Date(input.exp * 1000),
  });

  // Invalidate the stored refresh token.
  await User.updateOne({ _id: input.userId }, { $unset: { refreshToken: 1 } });

  log('info', 'User logged out', { userId: input.userId });
}

async function issueTokens(userId: string, role: string): Promise<AuthResult> {
  const token = signAccessToken({ userId, role });
  const refreshToken = signRefreshToken(userId);

  // Store only a hash of the refresh token, never the raw value.
  await User.updateOne({ _id: userId }, { refreshToken: sha256(refreshToken) });

  const user = await User.findById(userId);
  if (!user) throw forbidden('User not found after token issue');

  return { user: user.toJSON(), token, refreshToken };
}

export const authService = { register, login, refresh, logout };
