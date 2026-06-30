import express from 'express';
import { protect, admin, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

// Controller Imports
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  verifyOTP,
  resetPassword,
  verifyLoginOTP,
  googleLogin,
} from '../controllers/authController.js';

import {
  createSubject,
  getSubjects,
  deleteSubject,
} from '../controllers/subjectController.js';

import {
  uploadNote,
  getNotes,
  deleteNote,
  toggleBookmarkNote,
} from '../controllers/noteController.js';

import {
  generateOrGetSummary,
  getSummaries,
  toggleBookmarkSummary,
} from '../controllers/summaryController.js';

import {
  generateOrGetQuiz,
  getQuizzes,
  getQuizDetails,
  submitQuizResult,
  deleteQuiz,
} from '../controllers/quizController.js';

import {
  generateOrGetFlashcards,
  getFlashcards,
  toggleLearned,
  toggleFavorite,
} from '../controllers/flashcardController.js';

import {
  logStudyActivity,
  getProgressStats,
  getLeaderboard,
  getBadgesList,
  createRevisionSchedule,
} from '../controllers/progressController.js';

import { askAssistant } from '../controllers/chatController.js';

import {
  getAllUsers,
  deleteUser,
  updateUserRole,
  getSystemStats,
  getSystemLogs,
} from '../controllers/adminController.js';

import {
  getTeachersForStudent,
  sendConnectionRequest,
  getConnectionRequestsForTeacher,
  updateConnectionStatus,
} from '../controllers/connectionController.js';

const router = express.Router();

// ==========================================
// Authentication Routes
// ==========================================
router.post('/auth/register', upload.single('profilePicture'), registerUser);
router.post('/auth/login', loginUser);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/verify-otp', verifyOTP);
router.put('/auth/reset-password', resetPassword);
router.post('/auth/verify-login-otp', verifyLoginOTP);
router.post('/auth/google-login', googleLogin);
router.route('/auth/profile')
  .get(protect, getUserProfile)
  .put(protect, upload.single('profilePicture'), updateUserProfile);

// ==========================================
// Subject Routes
// ==========================================
router.route('/subjects')
  .post(protect, authorize('admin', 'student'), createSubject)
  .get(protect, getSubjects);
router.delete('/subjects/:id', protect, authorize('admin', 'student'), deleteSubject);

// ==========================================
// Notes Routes
// ==========================================
router.route('/notes')
  .post(protect, authorize('student', 'teacher'), upload.single('file'), uploadNote)
  .get(protect, authorize('student', 'teacher'), getNotes);
router.delete('/notes/:id', protect, authorize('student', 'teacher'), deleteNote);
router.patch('/notes/:id/bookmark', protect, authorize('student'), toggleBookmarkNote);

// ==========================================
// Summary Routes
// ==========================================
router.route('/summaries')
  .post(protect, authorize('student'), generateOrGetSummary)
  .get(protect, authorize('student'), getSummaries);
router.patch('/summaries/:id/bookmark', protect, authorize('student'), toggleBookmarkSummary);

// ==========================================
// Quiz Routes
// ==========================================
router.route('/quizzes')
  .post(protect, authorize('student', 'teacher'), generateOrGetQuiz)
  .get(protect, authorize('student', 'teacher'), getQuizzes);
router.route('/quizzes/:id')
  .get(protect, authorize('student', 'teacher'), getQuizDetails)
  .delete(protect, authorize('teacher', 'admin'), deleteQuiz);
router.post('/quizzes/:id/submit', protect, authorize('student'), submitQuizResult);

// ==========================================
// Flashcard Routes
// ==========================================
router.route('/flashcards')
  .post(protect, authorize('student'), generateOrGetFlashcards)
  .get(protect, authorize('student'), getFlashcards);
router.patch('/flashcards/:id/learned', protect, authorize('student'), toggleLearned);
router.patch('/flashcards/:id/favorite', protect, authorize('student'), toggleFavorite);

// ==========================================
// Progress, Revision, and Gamification Routes
// ==========================================
router.post('/progress', protect, authorize('student'), logStudyActivity);
router.get('/progress/dashboard', protect, authorize('student'), getProgressStats);
router.get('/progress/leaderboard', protect, authorize('student'), getLeaderboard);
router.get('/progress/badges', protect, authorize('student'), getBadgesList);
router.post('/progress/revision-planner', protect, authorize('student'), createRevisionSchedule);

// ==========================================
// AI Assistant Chat Routes
// ==========================================
router.post('/chat', protect, authorize('student'), askAssistant);

// ==========================================
// Connection Routes (Student-Teacher Connection)
// ==========================================
router.get('/connections/teachers', protect, authorize('student'), getTeachersForStudent);
router.post('/connections', protect, authorize('student'), sendConnectionRequest);
router.get('/connections/requests', protect, authorize('teacher'), getConnectionRequestsForTeacher);
router.patch('/connections/:id', protect, authorize('teacher'), updateConnectionStatus);

// ==========================================
// Admin Panel Routes
// ==========================================
router.get('/admin/users', protect, admin, getAllUsers);
router.delete('/admin/users/:id', protect, admin, deleteUser);
router.patch('/admin/users/:id/role', protect, admin, updateUserRole);
router.get('/admin/stats', protect, admin, getSystemStats);
router.get('/admin/logs', protect, admin, getSystemLogs);

export default router;
