import Note from '../models/Note.js';
import User from '../models/User.js';
import Connection from '../models/Connection.js';
import { askStudyAssistant } from '../services/aiService.js';

/**
 * @desc    Ask questions to the AI Study Assistant
 * @route   POST /api/chat
 * @access  Private
 */
export const askAssistant = async (req, res) => {
  try {
    const { question, chatHistory, noteId } = req.body;

    if (!question) {
      return res.status(400).json({ message: 'Question is required' });
    }

    let noteText = '';
    if (noteId) {
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
      if (note) {
        noteText = note.extractedText;
      }
    }

    const reply = await askStudyAssistant(chatHistory || [], question, noteText, req.user.geminiApiKey);

    // Reward XP +5 for active study questioning
    const user = await User.findById(req.user._id);
    if (user) {
      user.xp += 5;
      await user.save();
    }

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
