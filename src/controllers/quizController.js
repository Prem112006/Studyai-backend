import Quiz from '../models/Quiz.js';
import Note from '../models/Note.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import Progress from '../models/Progress.js';
import Connection from '../models/Connection.js';
import { generateQuiz } from '../services/aiService.js';

/**
 * @desc    Generate a new quiz from a note
 * @route   POST /api/quizzes
 * @access  Private
 */
export const generateOrGetQuiz = async (req, res) => {
  try {
    const { noteId, difficulty, count, subjectId } = req.body;

    let targetText = '';
    let dbSubjectId = subjectId;

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

      if (!note) {
        return res.status(404).json({ message: 'Note not found or unauthorized' });
      }
      targetText = note.extractedText;
      dbSubjectId = note.subject;
    } else if (subjectId) {
      // Find all notes of this subject to consolidate text context (including teacher notes)
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
      return res.status(400).json({ message: 'No study materials found to generate quiz from. Please upload notes first.' });
    }

    // Call AI to generate Quiz questions
    const difficultyLevel = difficulty || 'medium';
    const questionCount = count ? parseInt(count) : 5;
    const questions = await generateQuiz(targetText, difficultyLevel, questionCount, req.user.geminiApiKey);

    // Save to Database
    const quiz = await Quiz.create({
      note: noteId || null,
      subject: dbSubjectId,
      user: req.user._id,
      title: `Quiz: ${difficultyLevel.toUpperCase()} - ${new Date().toLocaleDateString()}`,
      questions,
      difficulty: difficultyLevel,
      maxScore: questionCount,
    });

    res.status(201).json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get all quizzes completed/active for the user
 * @route   GET /api/quizzes
 * @access  Private
 */
export const getQuizzes = async (req, res) => {
  try {
    const { subjectId, teacherId } = req.query;
    let filter = { user: req.user._id };

    if (req.user.role === 'student' && teacherId) {
      // Verify connection with teacher
      const isConnected = await Connection.findOne({
        student: req.user._id,
        teacher: teacherId,
        status: 'accepted',
      });
      if (!isConnected) {
        return res.status(403).json({ message: 'Not connected to this teacher' });
      }
      filter = { user: teacherId };
    } else if (subjectId) {
      filter.subject = subjectId;
    }

    const quizzes = await Quiz.find(filter)
      .populate('note', 'title')
      .populate('subject', 'name color icon')
      .sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get details of a specific quiz
 * @route   GET /api/quizzes/:id
 * @access  Private
 */
export const getQuizDetails = async (req, res) => {
  try {
    let quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id })
      .populate('note', 'title')
      .populate('subject', 'name color icon');

    if (!quiz) {
      // Check if it's a connected teacher's quiz
      const teacherQuiz = await Quiz.findById(req.params.id)
        .populate('note', 'title')
        .populate('subject', 'name color icon');
      if (teacherQuiz && req.user.role === 'student') {
        const isConnected = await Connection.findOne({
          student: req.user._id,
          teacher: teacherQuiz.user,
          status: 'accepted',
        });
        if (isConnected) {
          quiz = teacherQuiz;
        }
      }
    }

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Submit a completed quiz and calculate score
 * @route   POST /api/quizzes/:id/submit
 * @access  Private
 */
export const submitQuizResult = async (req, res) => {
  try {
    const { score } = req.body;
    let quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });

    if (!quiz) {
      // Check if it's a connected teacher's quiz
      const teacherQuiz = await Quiz.findById(req.params.id);
      if (teacherQuiz && req.user.role === 'student') {
        const isConnected = await Connection.findOne({
          student: req.user._id,
          teacher: teacherQuiz.user,
          status: 'accepted',
        });
        if (isConnected) {
          // Clone the quiz for the student
          quiz = await Quiz.create({
            note: teacherQuiz.note || null,
            subject: teacherQuiz.subject,
            user: req.user._id,
            title: teacherQuiz.title,
            questions: teacherQuiz.questions,
            difficulty: teacherQuiz.difficulty,
            maxScore: teacherQuiz.maxScore,
          });
        }
      }
    }

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    quiz.score = score;
    quiz.isCompleted = true;
    quiz.completedAt = new Date();
    await quiz.save();

    // Reward XP based on performance: 10 XP base + 10 XP per correct answer
    const earnedXp = 10 + score * 10;
    const user = await User.findById(req.user._id);
    if (user) {
      user.xp += earnedXp;
      if (user.xp >= 300 && !user.badges.includes('Quiz Master')) {
        user.badges.push('Quiz Master');
      }
      await user.save();
    }

    // Log user progress
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await Progress.findOneAndUpdate(
      { user: req.user._id, date: today },
      { 
        $inc: { quizzesCompleted: 1, studyHours: 0.25 } // +15 mins equivalent study hours
      },
      { upsert: true, new: true }
    );

    res.json({
      message: 'Quiz submitted successfully',
      score,
      maxScore: quiz.maxScore,
      earnedXp,
      userXp: user ? user.xp : 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Delete a quiz
 * @route   DELETE /api/quizzes/:id
 * @access  Private (Teacher, Admin)
 */
export const deleteQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Verify ownership or admin role
    if (quiz.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to delete this quiz' });
    }

    await quiz.deleteOne();
    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

