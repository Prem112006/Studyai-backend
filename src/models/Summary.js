import mongoose from 'mongoose';

const summarySchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      required: false,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shortSummary: {
      type: String,
      required: true,
    },
    keyConcepts: {
      type: [String],
      default: [],
    },
    detailedSummary: {
      type: String,
      required: true,
    },
    bulletPoints: {
      type: [String],
      default: [],
    },
    isBookmarked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound text index for search
summarySchema.index({ shortSummary: 'text', detailedSummary: 'text' });

const Summary = mongoose.model('Summary', summarySchema);
export default Summary;
