import mongoose from 'mongoose';

export interface BlacklistedTokenDoc {
  _id: mongoose.Types.ObjectId;
  jti: string;
  expiresAt: Date;
}

const blacklistedTokenSchema = new mongoose.Schema<BlacklistedTokenDoc>(
  {
    jti: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL index: auto-delete once the underlying token would have expired.
blacklistedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BlacklistedToken = mongoose.model<BlacklistedTokenDoc>(
  'BlacklistedToken',
  blacklistedTokenSchema,
);
