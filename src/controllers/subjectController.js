import Subject from '../models/Subject.js';
import Note from '../models/Note.js';
import Summary from '../models/Summary.js';
import Quiz from '../models/Quiz.js';
import Flashcard from '../models/Flashcard.js';

/**
 * @desc    Create a new subject
 * @route   POST /api/subjects
 * @access  Private
 */
export const createSubject = async (req, res) => {
  try {
    const { name, color, icon } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Subject name is required' });
    }

    // Check if subject already exists for this user
    const exists = await Subject.findOne({ user: req.user._id, name });
    if (exists) {
      return res.status(400).json({ message: 'Subject with this name already exists' });
    }

    const subject = await Subject.create({
      name,
      color,
      icon,
      user: req.user._id,
    });

    res.status(201).json(subject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get all subjects for current user
 * @route   GET /api/subjects
 * @access  Private
 */
export const getSubjects = async (req, res) => {
  try {
    const subjects = req.user.role === 'student'
      ? await Subject.find({})
      : await Subject.find({ user: req.user._id });
    res.json(subjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Delete a subject
 * @route   DELETE /api/subjects/:id
 * @access  Private
 */
export const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, user: req.user._id });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found or unauthorized' });
    }

    // Cascade delete all notes, summaries, quizzes, and flashcards under this subject
    await Note.deleteMany({ subject: subject._id });
    await Summary.deleteMany({ subject: subject._id });
    await Quiz.deleteMany({ subject: subject._id });
    await Flashcard.deleteMany({ subject: subject._id });
    
    await subject.deleteOne();

    res.json({ message: 'Subject and all associated notes/quizzes/flashcards deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
