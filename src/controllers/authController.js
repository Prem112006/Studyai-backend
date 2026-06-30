import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import crypto from 'crypto';
import sendEmail from '../utils/sendEmail.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;

    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ message: 'This email is already registered. Please go to the login section.' });
    }

    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    // Handle profile picture path if uploaded
    let profilePicture = '';
    if (req.file) {
      profilePicture = `/uploads/${req.file.filename}`;
    }

    const user = await User.create({
      name,
      username,
      email,
      password,
      role: role || 'student',
      profilePicture,
      lastActive: new Date(),
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        streak: user.streak,
        xp: user.xp,
        badges: user.badges,
        geminiApiKey: user.geminiApiKey || '',
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Auth user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      // Check if it is a default user
      const isDefaultUser = 
        (email.toLowerCase() === 'student@studyai.com' && password === 'student123') ||
        (email.toLowerCase() === 'teacher@studyai.com' && password === 'teacher123') ||
        (email.toLowerCase() === 'admin@studyai.com' && password === 'admin123');

      if (isDefaultUser) {
        // Direct Login Flow (No OTP)
        // Update streak and active status
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastActiveDate = new Date(user.lastActive);
        lastActiveDate.setHours(0, 0, 0, 0);
   
        const diffTime = today - lastActiveDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
   
        if (diffDays === 1) {
          user.streak += 1;
        } else if (diffDays > 1) {
          user.streak = 1; // Streak reset to 1
        } else if (user.streak === 0) {
          user.streak = 1; // First day active
        }
   
        user.lastActive = new Date();
        
        // Award XP for logging in
        user.xp += 10;
        
        // Check for streak-based badges
        if (user.streak >= 7 && !user.badges.includes('Week Warrior')) {
          user.badges.push('Week Warrior');
        }
        if (user.xp >= 100 && !user.badges.includes('Scholar Apprentice')) {
          user.badges.push('Scholar Apprentice');
        }
   
        await user.save();
   
        return res.json({
          _id: user._id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          profilePicture: user.profilePicture,
          streak: user.streak,
          xp: user.xp,
          badges: user.badges,
          geminiApiKey: user.geminiApiKey || '',
          token: generateToken(user._id),
        });
      }

      // Generate OTP code
      const otp = user.getResetOTP();
      await user.save();

      const message = `Your login verification code is: ${otp}. This code is valid for 10 minutes.`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <h2 style="color: #4f46e5; margin-bottom: 20px; text-align: center;">StudyAI Login Verification Code</h2>
          <p style="color: #334155; line-height: 1.6;">Use the following verification code (OTP) to complete your login. This code will expire in 10 minutes.</p>
          <div style="margin: 30px 0; text-align: center;">
            <div style="background-color: #f1f5f9; color: #1e293b; padding: 16px 32px; border-radius: 12px; font-size: 32px; font-weight: 800; tracking-widest: 4px; display: inline-block; border: 1px dashed #4f46e5;">
              ${otp}
            </div>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.6; text-align: center;">If you did not attempt to sign in, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center;">StudyAI Platform &copy; 2026</p>
        </div>
      `;

      try {
        const emailOptions = {
          email: user.email,
          subject: 'StudyAI - Login Verification OTP Code',
          message,
          html,
        };

        await sendEmail(emailOptions);

        res.status(200).json({
          success: true,
          requireVerification: true,
          email: user.email,
        });
      } catch (err) {
        console.error(err);
        user.resetOTP = undefined;
        user.resetOTPExpire = undefined;
        await user.save({ validateBeforeSave: false });

        return res.status(500).json({ message: 'Email could not be sent' });
      }
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
 
/**
 * @desc    Get user profile
 * @route   GET /api/auth/profile
 * @access  Private
 */
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        streak: user.streak,
        xp: user.xp,
        badges: user.badges,
        geminiApiKey: user.geminiApiKey || '',
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
 
/**
 * @desc    Update user profile
 * @route   PUT /api/auth/profile
 * @access  Private
 */
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
 
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      
      if (req.body.password) {
        user.password = req.body.password;
      }
      
      if (req.file) {
        user.profilePicture = `/uploads/${req.file.filename}`;
      }
 
      if (req.body.geminiApiKey !== undefined) {
        user.geminiApiKey = req.body.geminiApiKey;
      }
      
      const updatedUser = await user.save();
 
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        profilePicture: updatedUser.profilePicture,
        streak: updatedUser.streak,
        xp: updatedUser.xp,
        badges: updatedUser.badges,
        geminiApiKey: updatedUser.geminiApiKey || '',
        token: generateToken(updatedUser._id),
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Forgot password - generate reset OTP
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'There is no user with that email' });
    }

    // Get reset OTP
    const otp = user.getResetOTP();

    await user.save({ validateBeforeSave: false });

    const message = `Your password reset verification code is: ${otp}. This code is valid for 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; margin-bottom: 20px; text-align: center;">StudyAI Password Reset Code</h2>
        <p style="color: #334155; line-height: 1.6;">You are receiving this email because you (or someone else) has requested a password reset for your StudyAI account.</p>
        <p style="color: #334155; line-height: 1.6;">Use the following verification code (OTP) to reset your password. This code will expire in 10 minutes.</p>
        <div style="margin: 30px 0; text-align: center;">
          <div style="background-color: #f1f5f9; color: #1e293b; padding: 16px 32px; border-radius: 12px; font-size: 32px; font-weight: 800; tracking-widest: 4px; display: inline-block; border: 1px dashed #4f46e5;">
            ${otp}
          </div>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.6; text-align: center;">If you did not request this code, please ignore this email and your password will remain unchanged.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">StudyAI Platform &copy; 2026</p>
      </div>
    `;

    try {
      const emailOptions = {
        email: user.email,
        subject: 'StudyAI - Password Reset OTP Code',
        message,
        html,
      };

      await sendEmail(emailOptions);

      res.status(200).json({
        success: true,
        message: 'OTP sent to email successfully',
        previewUrl: emailOptions.previewUrl,
      });
    } catch (err) {
      console.error(err);
      user.resetOTP = undefined;
      user.resetOTPExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Verify OTP
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({
      email,
      resetOTP: otp,
      resetOTPExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Reset password using OTP
 * @route   PUT /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    const user = await User.findOne({
      email,
      resetOTP: otp,
      resetOTPExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Set new password
    user.password = password;
    user.resetOTP = undefined;
    user.resetOTPExpire = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Verify login OTP and activate/login user
 * @route   POST /api/auth/verify-login-otp
 * @access  Public
 */
export const verifyLoginOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({
      email,
      resetOTP: otp,
      resetOTPExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP code' });
    }

    // Activate the user
    user.isVerified = true;
    user.resetOTP = undefined;
    user.resetOTPExpire = undefined;

    // Update streak and active status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastActiveDate = new Date(user.lastActive);
    lastActiveDate.setHours(0, 0, 0, 0);

    const diffTime = today - lastActiveDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      user.streak += 1;
    } else if (diffDays > 1) {
      user.streak = 1;
    } else if (user.streak === 0) {
      user.streak = 1;
    }

    user.lastActive = new Date();
    user.xp += 10;

    if (user.streak >= 7 && !user.badges.includes('Week Warrior')) {
      user.badges.push('Week Warrior');
    }
    if (user.xp >= 100 && !user.badges.includes('Scholar Apprentice')) {
      user.badges.push('Scholar Apprentice');
    }

    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      streak: user.streak,
      xp: user.xp,
      badges: user.badges,
      geminiApiKey: user.geminiApiKey || '',
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Google Sign In / Sign Up handler (creates/logs in user in DB)
 * @route   POST /api/auth/google-login
 * @access  Public
 */
export const googleLogin = async (req, res) => {
  try {
    const { accessToken, email: inputEmail, name: inputName, username, profilePicture: inputProfilePicture, password, role } = req.body;

    let email, name, profilePicture;

    if (accessToken) {
      // Real Google OAuth verification flow
      try {
        const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`);
        if (!response.ok) {
          return res.status(401).json({ message: 'Invalid or expired Google access token' });
        }
        const data = await response.json();
        email = data.email;
        name = data.name || data.given_name || 'Google User';
        profilePicture = data.picture || '';
      } catch (fetchErr) {
        console.error('Error verifying token with Google APIs:', fetchErr);
        return res.status(500).json({ message: 'Failed to communicate with Google authentication servers' });
      }
    } else {
      // Fallback simulated authentication mode for developer use
      email = inputEmail;
      name = inputName;
      profilePicture = inputProfilePicture || '';
    }

    if (!email) {
      return res.status(400).json({ message: 'Email is required for Google Login integration' });
    }

    let user = await User.findOne({ email });

    if (!user) {
      // Create new verified user since Google authentication pre-verifies email
      user = await User.create({
        name,
        username: username || email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''),
        email,
        password: password || Math.random().toString(36).slice(-10), // use provided password or secure random placeholder
        isVerified: true,
        profilePicture: profilePicture || '',
        lastActive: new Date(),
        role: role || 'student',
      });
    } else {
      // If a role was specified in the request (e.g. from the registration page),
      // it means they are in the Create Account section but the account already exists.
      if (role) {
        return res.status(400).json({ message: 'This email is already registered. Please go to the login section.' });
      }

      // If password is provided in simulated mode, verify it
      if (password) {
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid password' });
        }
      }

      // Update last active status
      user.lastActive = new Date();
      if (!user.profilePicture && profilePicture) {
        user.profilePicture = profilePicture;
      }
      await user.save();
    }

    res.status(200).json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      streak: user.streak,
      xp: user.xp,
      badges: user.badges,
      geminiApiKey: user.geminiApiKey || '',
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
