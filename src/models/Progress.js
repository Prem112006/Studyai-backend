import mongoose from 'mongoose';

const progressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    studyHours: {
      type: Number,
      default: 0,
    },
    quizzesCompleted: {
      type: Number,
      default: 0,
    },
    flashcardsLearned: {
      type: Number,
      default: 0,
    },
    date: {
      type: Date,
      default: () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
      },
    },
  },
  {
    timestamps: true,
  }
);

// Unique progress record per user per day
progressSchema.index({ user: 1, date: 1 }, { unique: true });

const Progress = mongoose.model('Progress', progressSchema);
export default Progress;
