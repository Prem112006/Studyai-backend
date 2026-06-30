import fs from 'fs';
import path from 'path';
import Note from '../models/Note.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import Progress from '../models/Progress.js';
import { extractTextFromFile } from '../services/parserService.js';
import Connection from '../models/Connection.js';

/**
 * @desc    Upload a note and parse its text contents
 * @route   POST /api/notes
 * @access  Private
 */
export const uploadNote = async (req, res) => {
  try {
    const { title, subjectId } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!title) {
      // Clean up uploaded file if missing parameters
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Title is required' });
    }

    let dbSubjectId = subjectId;
    if (!dbSubjectId) {
      // Find or create a default "General" subject for the current user
      let defaultSubject = await Subject.findOne({ name: 'General', user: req.user._id });
      if (!defaultSubject) {
        defaultSubject = await Subject.create({
          name: 'General',
          color: '#6366f1',
          icon: 'BookOpen',
          user: req.user._id,
        });
      }
      dbSubjectId = defaultSubject._id;
    } else {
      // Verify subject exists
      const subject = await Subject.findById(dbSubjectId);
      if (!subject) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: 'Subject not found' });
      }
    }

    // Parse the file contents based on its type
    const filePath = req.file.path;
    let extractedText = '';

    try {
      extractedText = await extractTextFromFile(filePath);
    } catch (parseError) {
      // Clean up file and forward error
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: parseError.message });
    }

    const note = await Note.create({
      title,
      subject: dbSubjectId,
      fileUrl: `/uploads/${req.file.filename}`,
      extractedText,
      uploadedBy: req.user._id,
    });

    // Update User XP for uploading a note
    const user = await User.findById(req.user._id);
    if (user) {
      user.xp += 25; // 25 XP per note uploaded
      if (user.xp >= 500 && !user.badges.includes('Note Scholar')) {
        user.badges.push('Note Scholar');
      }
      await user.save();
    }

    // Record progress activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await Progress.findOneAndUpdate(
      { user: req.user._id, date: today },
      { $inc: { studyHours: 0.5 } }, // count upload as study initiation
      { upsert: true, new: true }
    );

    res.status(201).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get all notes for current user
 * @route   GET /api/notes
 * @access  Private
 */
export const getNotes = async (req, res) => {
  try {
    const { subjectId, teacherId } = req.query;
    let filter = { uploadedBy: req.user._id };

    if (req.user.role === 'student') {
      if (teacherId) {
        // Verify connection with teacher
        const isConnected = await Connection.findOne({
          student: req.user._id,
          teacher: teacherId,
          status: 'accepted',
        });
        if (!isConnected) {
          return res.status(403).json({ message: 'Not connected to this teacher' });
        }
        filter = { uploadedBy: teacherId };
      } else {
        // Student's own notes
        filter = { uploadedBy: req.user._id };
      }
    }
    
    if (subjectId) {
      filter.subject = subjectId;
    }

    const notes = await Note.find(filter)
      .populate('uploadedBy', 'name email role')
      .populate('subject', 'name color icon');
    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Delete a note
 * @route   DELETE /api/notes/:id
 * @access  Private
 */
export const deleteNote = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, uploadedBy: req.user._id });

    if (!note) {
      return res.status(404).json({ message: 'Note not found or unauthorized' });
    }

    // Delete file from disk if it exists
    const filename = path.basename(note.fileUrl);
    const diskPath = path.join('./uploads', filename);
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }

    await note.deleteOne();
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Toggle note bookmark status
 * @route   PATCH /api/notes/:id/bookmark
 * @access  Private
 */
export const toggleBookmarkNote = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, uploadedBy: req.user._id });

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    note.isBookmarked = !note.isBookmarked;
    await note.save();

    res.json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
