import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure uniqueness of student-teacher connection requests
connectionSchema.index({ student: 1, teacher: 1 }, { unique: true });

const Connection = mongoose.model('Connection', connectionSchema);
export default Connection;
