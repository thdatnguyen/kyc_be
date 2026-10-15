import mongoose from 'mongoose';

export interface MediaDoc {
  _id: mongoose.Types.ObjectId;
  publicId: string;
  owner: mongoose.Types.ObjectId;
  kind: 'document' | 'selfie';
  createdAt: Date;
}

const mediaSchema = new mongoose.Schema<MediaDoc>(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['document', 'selfie'], required: true },
  },
  { timestamps: true },
);

export const Media = mongoose.model<MediaDoc>('Media', mediaSchema);
