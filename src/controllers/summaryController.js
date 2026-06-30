import Summary from '../models/Summary.js';
import Note from '../models/Note.js';
import User from '../models/User.js';
import Connection from '../models/Connection.js';
import { generateSummary } from '../services/aiService.js';

/**
 * @desc    Generate or fetch cached summary for a specific note
 * @route   POST /api/summaries
 * @access  Private
 */
export const generateOrGetSummary = async (req, res) => {
  try {
    const { noteId, regenerate } = req.body;

    if (!noteId) {
      return res.status(400).json({ message: 'noteId is required' });
    }

    // Check if summary already exists
    let summary = await Summary.findOne({ note: noteId, user: req.user._id });
    if (summary && !regenerate) {
      return res.json(summary);
    }

    // Retrieve note
    let note = await Note.findOne({ _id: noteId, uploadedBy: req.user._id });
    if (!note && req.user.role === 'student') {
      const parentNote = await Note.findById(noteId);
      if (parentNote) {
        const isConnected = await Connection.findOne({
          student: req.user._id,
          teacher: parentNote.uploadedBy,
          status: 'accepted',
        });
        if (isConnected) {
          note = parentNote;
        }
      }
    }

    if (!note) {
      return res.status(404).json({ message: 'Note not found or unauthorized' });
    }

    if (!note.extractedText || note.extractedText.trim() === '') {
      return res.status(400).json({ message: 'Note file is empty or has no extractable text' });
    }

    // Call AI service
    const aiOutput = await generateSummary(note.extractedText, req.user.geminiApiKey);

    // Save or Update in Database
    if (summary) {
      summary.shortSummary = aiOutput.shortSummary;
      summary.keyConcepts = aiOutput.keyConcepts;
      summary.detailedSummary = aiOutput.detailedSummary;
      summary.bulletPoints = aiOutput.bulletPoints;
      await summary.save();
    } else {
      summary = await Summary.create({
        note: noteId,
        subject: note.subject,
        user: req.user._id,
        shortSummary: aiOutput.shortSummary,
        keyConcepts: aiOutput.keyConcepts,
        detailedSummary: aiOutput.detailedSummary,
        bulletPoints: aiOutput.bulletPoints,
      });
    }

    // Award XP to user for generating summary
    const user = await User.findById(req.user._id);
    if (user) {
      user.xp += 15;
      await user.save();
    }

    res.status(201).json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get all summaries for the logged-in user
 * @route   GET /api/summaries
 * @access  Private
 */
export const getSummaries = async (req, res) => {
  try {
    const { subjectId, noteId } = req.query;
    const filter = { user: req.user._id };

    if (subjectId) {
      filter.subject = subjectId;
    }
    if (noteId) {
      filter.note = noteId;
    }

    const summaries = await Summary.find(filter)
      .populate('note', 'title fileUrl')
      .populate('subject', 'name color icon');
    res.json(summaries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Toggle summary bookmark status
 * @route   PATCH /api/summaries/:id/bookmark
 * @access  Private
 */
export const toggleBookmarkSummary = async (req, res) => {
  try {
    const summary = await Summary.findOne({ _id: req.params.id, user: req.user._id });

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found' });
    }

    summary.isBookmarked = !summary.isBookmarked;
    await summary.save();

    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
