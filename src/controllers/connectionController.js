import Connection from '../models/Connection.js';
import User from '../models/User.js';

/**
 * @desc    Get all teachers with connection status for student
 * @route   GET /api/connections/teachers
 * @access  Private (Student)
 */
export const getTeachersForStudent = async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('name email profilePicture');
    const connections = await Connection.find({ student: req.user._id });

    // Create a lookup map of teacher connection statuses
    const connectionMap = {};
    connections.forEach((conn) => {
      connectionMap[conn.teacher.toString()] = {
        id: conn._id,
        status: conn.status,
      };
    });

    const teacherList = teachers.map((teacher) => {
      const conn = connectionMap[teacher._id.toString()];
      return {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        profilePicture: teacher.profilePicture,
        connectionStatus: conn ? conn.status : 'none',
        connectionId: conn ? conn.id : null,
      };
    });

    res.json(teacherList);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Send connection request to a teacher
 * @route   POST /api/connections
 * @access  Private (Student)
 */
export const sendConnectionRequest = async (req, res) => {
  try {
    const { teacherId } = req.body;

    if (!teacherId) {
      return res.status(400).json({ message: 'Teacher ID is required' });
    }

    // Verify teacher exists and has teacher role
    const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if request already exists
    const existing = await Connection.findOne({ student: req.user._id, teacher: teacherId });
    if (existing) {
      if (existing.status === 'rejected') {
        // Allow resubmitting if previously rejected
        existing.status = 'pending';
        await existing.save();
        return res.json(existing);
      }
      return res.status(400).json({ message: 'Connection request already exists' });
    }

    const connection = await Connection.create({
      student: req.user._id,
      teacher: teacherId,
      status: 'pending',
    });

    res.status(201).json(connection);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get all student connection requests & active students for teacher
 * @route   GET /api/connections/requests
 * @access  Private (Teacher)
 */
export const getConnectionRequestsForTeacher = async (req, res) => {
  try {
    const connections = await Connection.find({ teacher: req.user._id })
      .populate('student', 'name email profilePicture')
      .sort({ updatedAt: -1 });

    const pendingRequests = connections.filter((c) => c.status === 'pending');
    const connectedStudents = connections.filter((c) => c.status === 'accepted');

    res.json({
      pendingRequests,
      connectedStudents,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Accept or reject connection request
 * @route   PATCH /api/connections/:id
 * @access  Private (Teacher)
 */
export const updateConnectionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid connection status' });
    }

    const connection = await Connection.findOne({ _id: id, teacher: req.user._id });
    if (!connection) {
      return res.status(404).json({ message: 'Connection request not found or unauthorized' });
    }

    connection.status = status;
    await connection.save();

    res.json(connection);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
