import Flashcard from '../models/Flashcard.js';
import Note from '../models/Note.js';
import User from '../models/User.js';
import Progress from '../models/Progress.js';
import Connection from '../models/Connection.js';
import { generateFlashcards } from '../services/aiService.js';

/**
 * @desc    Generate a set of flashcards from a note
 * @route   POST /api/flashcards
 * @access  Private
 */
export const generateOrGetFlashcards = async (req, res) => {
  try {
    const { noteId, count, subjectId } = req.body;

    let targetText = '';
    let dbSubjectId = subjectId;

    if (noteId) {
      // Check if some flashcards already exist for this note
      const existingCount = await Flashcard.countDocuments({ note: noteId, user: req.user._id });
      if (existingCount > 0) {
        const cards = await Flashcard.find({ note: noteId, user: req.user._id });
        return res.json(cards);
      }

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
      targetText = note.extractedText;
      dbSubjectId = note.subject;
    } else if (subjectId) {
      let filter = { subject: subjectId, uploadedBy: req.user._id };
      if (req.user.role === 'student') {
        const acceptedConnections = await Connection.find({
          student: req.user._id,
          status: 'accepted',
        });
        const teacherIds = acceptedConnections.map((c) => c.teacher);
        filter = {
          subject: subjectId,
          $or: [
            { uploadedBy: req.user._id },
            { uploadedBy: { $in: teacherIds } },
          ],
        };
      }
      const notes = await Note.find(filter);
      targetText = notes.map((n) => n.extractedText).join('\n\n');
    }

    if (!targetText || targetText.trim() === '') {
      return res.status(400).json({ message: 'No study materials found to generate flashcards from. Please upload notes first.' });
    }

    // Call AI service
    const cardCount = count ? parseInt(count) : 6;
    const aiOutput = await generateFlashcards(targetText, cardCount, req.user.geminiApiKey);

    // Save each card to db
    const savedCards = [];
    for (const card of aiOutput) {
      const createdCard = await Flashcard.create({
        note: noteId || null,
        subject: dbSubjectId,
        user: req.user._id,
        front: card.front,
        back: card.back,
      });
      savedCards.push(createdCard);
    }

    // Award XP to user for generating cards
    const user = await User.findById(req.user._id);
    if (user) {
      user.xp += 15;
      await user.save();
    }

    res.status(201).json(savedCards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get all flashcards for user
 * @route   GET /api/flashcards
 * @access  Private
 */
export const getFlashcards = async (req, res) => {
  try {
    const { subjectId, isFavorite, isLearned, noteId } = req.query;
    const filter = { user: req.user._id };

    if (subjectId) {
      filter.subject = subjectId;
    }
    if (noteId) {
      filter.note = noteId;
    }
    if (isFavorite === 'true') {
      filter.isFavorite = true;
    }
    if (isLearned === 'true') {
      filter.isLearned = true;
    } else if (isLearned === 'false') {
      filter.isLearned = false;
    }

    const cards = await Flashcard.find(filter)
      .populate('note', 'title')
      .populate('subject', 'name color icon')
      .sort({ createdAt: -1 });

    res.json(cards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Toggle flashcard learned status
 * @route   PATCH /api/flashcards/:id/learned
 * @access  Private
 */
export const toggleLearned = async (req, res) => {
  try {
    const card = await Flashcard.findOne({ _id: req.params.id, user: req.user._id });

    if (!card) {
      return res.status(404).json({ message: 'Flashcard not found' });
    }

    card.isLearned = !card.isLearned;
    await card.save();

    if (card.isLearned) {
      // Award User XP +5
      const user = await User.findById(req.user._id);
      if (user) {
        user.xp += 5;
        if (user.xp >= 200 && !user.badges.includes('Memory Wizard')) {
          user.badges.push('Memory Wizard');
        }
        await user.save();
      }

      // Log progress activity
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await Progress.findOneAndUpdate(
        { user: req.user._id, date: today },
        { $inc: { flashcardsLearned: 1 } },
        { upsert: true, new: true }
      );
    }

    res.json(card);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Toggle flashcard favorite status
 * @route   PATCH /api/flashcards/:id/favorite
 * @access  Private
 */
export const toggleFavorite = async (req, res) => {
  try {
    const card = await Flashcard.findOne({ _id: req.params.id, user: req.user._id });

    if (!card) {
      return res.status(404).json({ message: 'Flashcard not found' });
    }

    card.isFavorite = !card.isFavorite;
    await card.save();

    res.json(card);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
