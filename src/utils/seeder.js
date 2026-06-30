import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Subject from '../models/Subject.js';
import connectDB from '../config/db.js';

dotenv.config();

const seedData = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database for seeding...');

    // Clear existing data
    await User.deleteMany({});
    await Subject.deleteMany({});
    console.log('Cleared existing users and subjects.');

    // 1. Create Users
    const adminUser = await User.create({
      name: 'Admin Assistant',
      username: 'admin',
      email: 'admin@studyai.com',
      password: 'admin123',
      role: 'admin',
      xp: 500,
      badges: ['Scholar Apprentice', 'Week Warrior'],
      streak: 7,
    });

    const studentUser = await User.create({
      name: 'John Student',
      username: 'student',
      email: 'student@studyai.com',
      password: 'student123',
      role: 'student',
      xp: 150,
      badges: ['Scholar Apprentice'],
      streak: 3,
    });

    const teacherUser = await User.create({
      name: 'Prof. Jane Smith',
      username: 'teacher',
      email: 'teacher@studyai.com',
      password: 'teacher123',
      role: 'teacher',
      xp: 350,
      badges: ['Scholar Apprentice', 'Note Scholar'],
      streak: 5,
    });

    console.log('Seeded Users:');
    console.log(`- Admin: admin@studyai.com / admin123`);
    console.log(`- Student: student@studyai.com / student123`);
    console.log(`- Teacher: teacher@studyai.com / teacher123`);

    // 2. Create Subjects for Student
    await Subject.create([
      {
        name: 'Operating Systems',
        color: '#6366f1',
        icon: 'Cpu',
        user: studentUser._id,
      },
      {
        name: 'Computer Networks',
        color: '#10b981',
        icon: 'Globe',
        user: studentUser._id,
      },
      {
        name: 'Mathematics',
        color: '#f59e0b',
        icon: 'Calculator',
        user: studentUser._id,
      },
    ]);

    console.log('Seeded default subjects for Student user.');
    console.log('Seeding complete. Exiting.');
    process.exit(0);
  } catch (error) {
    console.error(`Seeding failed: ${error.message}`);
    process.exit(1);
  }
};

seedData();
