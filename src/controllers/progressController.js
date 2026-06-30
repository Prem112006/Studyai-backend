import Progress from '../models/Progress.js';
import Note from '../models/Note.js';
import Summary from '../models/Summary.js';
import Quiz from '../models/Quiz.js';
import Flashcard from '../models/Flashcard.js';
import User from '../models/User.js';
import Subject from '../models/Subject.js';
import { generateRevisionPlan } from '../services/aiService.js';

/**
 * @desc    Log custom study activity manually or programmatically
 * @route   POST /api/progress
 * @access  Private
 */
export const logStudyActivity = async (req, res) => {
  try {
    const { studyHours, quizzesCompleted, flashcardsLearned } = req.body;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const log = await Progress.findOneAndUpdate(
      { user: req.user._id, date: today },
      { 
        $inc: { 
          studyHours: parseFloat(studyHours || 0), 
          quizzesCompleted: parseInt(quizzesCompleted || 0), 
          flashcardsLearned: parseInt(flashcardsLearned || 0) 
        } 
      },
      { upsert: true, new: true }
    );

    // Award standard XP for study hours (10 XP per 0.5 hour logged)
    if (studyHours > 0) {
      const user = await User.findById(req.user._id);
      if (user) {
        user.xp += Math.round(studyHours * 20);
        await user.save();
      }
    }

    res.json(log);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get dashboard statistics and chart details
 * @route   GET /api/progress/dashboard
 * @access  Private
 */
export const getProgressStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Statistics Cards
    const totalNotes = await Note.countDocuments({ uploadedBy: userId });
    const totalSummaries = await Summary.countDocuments({ user: userId });
    const totalQuizzes = await Quiz.countDocuments({ user: userId, isCompleted: true });
    
    const quizResults = await Quiz.find({ user: userId, isCompleted: true });
    let averageQuizScore = 0;
    if (quizResults.length > 0) {
      const sum = quizResults.reduce((acc, curr) => acc + (curr.score / curr.maxScore), 0);
      averageQuizScore = Math.round((sum / quizResults.length) * 100);
    }

    const totalFlashcards = await Flashcard.countDocuments({ user: userId });
    const learnedFlashcards = await Flashcard.countDocuments({ user: userId, isLearned: true });

    // User details (Streak, XP, Badges)
    const user = await User.findById(userId);

    // 2. Weekly Activity Chart Data (last 7 days)
    const weeklyActivity = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const log = await Progress.findOne({ user: userId, date: d });
      weeklyActivity.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        studyHours: log ? log.studyHours : 0,
        quizzesCompleted: log ? log.quizzesCompleted : 0,
        flashcardsLearned: log ? log.flashcardsLearned : 0,
      });
    }

    // 3. Subject-wise performance metrics
    const subjects = req.user.role === 'student' ? await Subject.find({}) : await Subject.find({ user: userId });
    const subjectWiseStats = [];
    
    for (const sub of subjects) {
      const notesCount = await Note.countDocuments({ subject: sub._id, uploadedBy: userId });
      const quizCount = await Quiz.countDocuments({ subject: sub._id, user: userId, isCompleted: true });
      const cardsCount = await Flashcard.countDocuments({ subject: sub._id, user: userId });
      
      const subQuizzes = await Quiz.find({ subject: sub._id, user: userId, isCompleted: true });
      let avgScore = 0;
      if (subQuizzes.length > 0) {
        const sum = subQuizzes.reduce((acc, curr) => acc + (curr.score / curr.maxScore), 0);
        avgScore = Math.round((sum / subQuizzes.length) * 100);
      }

      subjectWiseStats.push({
        subjectName: sub.name,
        color: sub.color,
        notesCount,
        quizCount,
        cardsCount,
        averageScore: avgScore,
      });
    }

    res.json({
      summaryStats: {
        totalNotes,
        totalSummaries,
        totalQuizzes,
        averageQuizScore,
        totalFlashcards,
        learnedFlashcards,
        streak: user ? user.streak : 0,
        xp: user ? user.xp : 0,
        badges: user ? user.badges : [],
      },
      weeklyActivity,
      subjectWiseStats,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get study leaderboard
 * @route   GET /api/progress/leaderboard
 * @access  Private
 */
export const getLeaderboard = async (req, res) => {
  try {
    const topUsers = await User.find({})
      .select('name username profilePicture xp streak role')
      .sort({ xp: -1 })
      .limit(10);
    res.json(topUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get list of all gamified achievement badges
 * @route   GET /api/progress/badges
 * @access  Private
 */
export const getBadgesList = async (req, res) => {
  const allBadges = [
    { name: 'Week Warrior', description: 'Maintain a study streak of 7 days or more.', icon: 'Zap' },
    { name: 'Scholar Apprentice', description: 'Accumulate more than 100 study XP.', icon: 'Award' },
    { name: 'Note Scholar', description: 'Upload notes and trigger content analysis parsing.', icon: 'BookOpen' },
    { name: 'Quiz Master', description: 'Score perfectly or complete multiple assessment quizzes.', icon: 'CheckCircle' },
    { name: 'Memory Wizard', description: 'Review and fully learn at least 15 flashcards.', icon: 'Brain' },
  ];
  res.json(allBadges);
};

/**
 * @desc    Generate Revision Plan timetable via AI
 * @route   POST /api/progress/revision-planner
 * @access  Private
 */
export const createRevisionSchedule = async (req, res) => {
  try {
    const { examDate, subjects, studyHoursPerDay } = req.body;

    if (!examDate || !subjects || !studyHoursPerDay) {
      return res.status(400).json({ message: 'ExamDate, subjects, and studyHoursPerDay are required' });
    }

    const timetable = await generateRevisionPlan(examDate, subjects, parseFloat(studyHoursPerDay), req.user.geminiApiKey);
    res.json(timetable);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
