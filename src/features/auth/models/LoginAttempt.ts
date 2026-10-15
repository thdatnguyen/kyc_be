import mongoose from 'mongoose';

export interface LoginAttemptDoc {
  _id: mongoose.Types.ObjectId;
  emailHash: string;
  attempts: number;
  lockedUntil: Date | null;
  expiresAt: Date;
}

// Failed-login tracking keyed by email HASH (not email, not IP). Keying on the
// account (uniformly for existing AND unknown emails) defeats credential
// stuffing even when the attacker rotates IPs, while preserving enumeration
// privacy — an unknown email locks exactly like a real one.
const loginAttemptSchema = new mongoose.Schema<LoginAttemptDoc>(
  {
    emailHash: { type: String, required: true, unique: true, index: true },
    attempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL index: auto-clean stale attempt records.
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAttempt = mongoose.model<LoginAttemptDoc>('LoginAttempt', loginAttemptSchema);
