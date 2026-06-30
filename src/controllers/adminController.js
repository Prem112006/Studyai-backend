import User from '../models/User.js';
import Note from '../models/Note.js';
import Summary from '../models/Summary.js';
import Quiz from '../models/Quiz.js';
import Flashcard from '../models/Flashcard.js';
import Subject from '../models/Subject.js';

/**
 * @desc    Get all registered users
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Delete a user account and all their records
 * @route   DELETE /api/admin/users/:id
 * @access  Private/Admin
 */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin' && req.user._id.toString() === user._id.toString()) {
      return res.status(400).json({ message: 'Admins cannot delete their own account from the panel.' });
    }

    const userId = user._id;

    // Delete all associated entities
    await Subject.deleteMany({ user: userId });
    await Note.deleteMany({ uploadedBy: userId });
    await Summary.deleteMany({ user: userId });
    await Quiz.deleteMany({ user: userId });
    await Flashcard.deleteMany({ user: userId });
    
    await user.deleteOne();

    res.json({ message: `User ${user.username} and all their records deleted successfully` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Update a user's access role
 * @route   PATCH /api/admin/users/:id/role
 * @access  Private/Admin
 */
export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get overall system stats
 * @route   GET /api/admin/stats
 * @access  Private/Admin
 */
export const getSystemStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalNotes = await Note.countDocuments({});
    const totalSummaries = await Summary.countDocuments({});
    const totalQuizzes = await Quiz.countDocuments({ isCompleted: true });
    const totalFlashcards = await Flashcard.countDocuments({});

    const roleBreakdown = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    const topStreakUser = await User.findOne({}).sort({ streak: -1 }).select('username streak');

    res.json({
      stats: {
        totalUsers,
        totalNotes,
        totalSummaries,
        totalQuizzes,
        totalFlashcards,
        topStreak: topStreakUser ? `${topStreakUser.username} (${topStreakUser.streak} days)` : 'N/A'
      },
      roleBreakdown
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get system logs
 * @route   GET /api/admin/logs
 * @access  Private/Admin
 */
export const getSystemLogs = async (req, res) => {
  // Return mock server events for visualization
  const logs = [
    { timestamp: new Date(Date.now() - 5000).toISOString(), level: 'INFO', event: 'Database connection verified' },
    { timestamp: new Date(Date.now() - 15000).toISOString(), level: 'INFO', event: 'Cleaned temporary multer file cache' },
    { timestamp: new Date(Date.now() - 3600000).toISOString(), level: 'INFO', event: 'Gemini AI connection active' },
    { timestamp: new Date(Date.now() - 7200000).toISOString(), level: 'WARN', event: 'Rate limit trigger: IP 192.168.1.1 exceeded login limits' },
    { timestamp: new Date(Date.now() - 14400000).toISOString(), level: 'INFO', event: 'Daily progress logs successfully compiled' },
  ];
  res.json(logs);
};
