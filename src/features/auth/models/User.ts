import mongoose from 'mongoose';
import { Role } from '@core/types';

export interface UserDoc {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  role: Role;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserDoc>(
  {
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
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned by default
    },
    role: {
      type: String,
      enum: ['Admin', 'Applicant'],
      default: 'Applicant',
    },
    refreshToken: {
      type: String,
      select: false, // stores SHA-256 hash of the refresh token
    },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc, ret: any) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    delete ret.refreshToken;
    return ret;
  },
});

export const User = mongoose.model<UserDoc>('User', userSchema);
