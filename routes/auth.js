const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const { auth } = require('../middleware/auth'); // Import the auth middleware

// Debug endpoint to test student lookup
router.get('/debug-student/:rollNumber', async (req, res) => {
  try {
    const { rollNumber } = req.params;
    console.log('🔍 Debug: Looking for student with roll number:', rollNumber);
    
    const student = await Student.findOne({ rollNumber: rollNumber.toUpperCase() });
    if (student) {
      console.log('✅ Debug: Student found:', student.name);
      res.json({ success: true, found: true, name: student.name, rollNumber: student.rollNumber });
    } else {
      console.log('❌ Debug: Student not found');
      const studentExact = await Student.findOne({ rollNumber: rollNumber });
      res.json({ success: true, found: false, triedUppercase: rollNumber.toUpperCase(), triedExact: rollNumber, foundExact: !!studentExact });
    }
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const ADMIN_CREDENTIALS = {
  "floorincharge@kietgroup.com": {
    password: "FloorIncharge@2026",
    role: "floor-incharge",
    assignedBlock: "D-Block",
    assignedFloor: ["1st Floor", "2nd Floor", "3rd Floor", "4th Floor"],
    isAdmin: true
  },
  "hostelincharge@kietgroup.com": {
    password: "HostelIncharge@2026",
    role: "hostel-incharge",
  },
  "maingate@kietgroup.com": {
    password: "MainGate@2026",
    role: "gate",
  },
  "warden@kietgroup.com": {
    password: "Warden@2026",
    role: "warden",
  },
};

router.post('/register', async (req, res) => {
  try {
    console.log('🎓 Student Registration Request:', {
      body: req.body,
      hasRequiredFields: {
        email: !!req.body.email,
        name: !!req.body.name,
        rollNumber: !!req.body.rollNumber,
        branch: !!req.body.branch,
        semester: !!req.body.semester
      }
    });

    const {
      email,
      password,
      name,
      rollNumber,
      phoneNumber,
      parentPhoneNumber,
      hostelBlock,
      floor,
      roomNumber,
      branch,
      semester,
    } = req.body;

    // Validate required fields - email is now optional for students
    if (!name || !rollNumber || !hostelBlock || !floor || !roomNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: name, rollNumber, hostelBlock, floor, roomNumber are required' 
      });
    }

    // Check if student with roll number already exists
    let existingStudent = await Student.findOne({ rollNumber });
    if (existingStudent) {
      return res.status(400).json({ success: false, message: 'Student with this roll number already exists' });
    }

    // If email is provided, check if it already exists in both collections
    if (email) {
      existingStudent = await Student.findOne({ email });
      if (existingStudent) {
        return res.status(400).json({ success: false, message: 'Student with this email already exists' });
      }
      
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'User with this email already exists' });
      }
    }

    // Format floor value
    const formattedFloor = Student.formatFloor(floor);
    
    // Normalize hostel block values (especially women's block)
    const normalizeHostelBlock = (block) => {
      if (!block) return block;
      const b = String(block).trim();
      const lower = b.toLowerCase();
      if (['w-block', 'women-block', 'womens-block', 'women block', 'womens block', 'girls-block', 'girls block', 'w'].includes(lower)) {
        return 'Womens-Block';
      }
      if (lower.startsWith('d')) return 'D-Block';
      if (lower.startsWith('e')) return 'E-Block';
      // Default: ensure Dash-Block suffix capitalization
      const withSuffix = b.includes('-Block') ? b : `${b}-Block`;
      // Capitalize first letter
      return withSuffix.replace(/^([a-zA-Z])/, (m) => m.toUpperCase());
    };

    // Format hostel block using normalizer
    const formattedHostelBlock = normalizeHostelBlock(hostelBlock);

    // Use roll number as default password if none provided
    const defaultPassword = password || rollNumber;

    const studentData = {
      email: email || null, // Email is optional for students
      password: defaultPassword, // Will be hashed by the pre-save middleware
      name,
      rollNumber,
      phoneNumber,
      parentPhoneNumber,
      hostelBlock: formattedHostelBlock,
      floor: formattedFloor,
      roomNumber,
      branch: branch || 'Computer Science', // Default branch
      semester: semester || 1, // Default semester
      role: 'student',
    };

    console.log('📝 Creating student with data:', {
      ...studentData,
      password: '[HIDDEN]'
    });

    user = new Student(studentData);
    await user.save();

    console.log('✅ Student registered successfully:', {
      id: user._id,
      name: user.name,
      email: user.email,
      rollNumber: user.rollNumber
    });

    res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      student: {
        id: user._id,
        name: user.name,
        email: user.email,
        rollNumber: user.rollNumber,
        hostelBlock: user.hostelBlock,
        floor: user.floor,
        roomNumber: user.roomNumber,
        branch: user.branch,
        semester: user.semester
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      body: req.body
    });
    
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration',
      details: error.name // For debugging
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Handle admin users
    if (ADMIN_CREDENTIALS[email]) {
      if (password === ADMIN_CREDENTIALS[email].password) {
        const adminData = {
          id: email,
          email,
          role: ADMIN_CREDENTIALS[email].role,
          isAdmin: true,
          assignedBlock: ADMIN_CREDENTIALS[email].assignedBlock,
          assignedFloor: ADMIN_CREDENTIALS[email].assignedFloor,
          name: ADMIN_CREDENTIALS[email].role.replace('-', ' ').toUpperCase(),
        };

        const token = jwt.sign(
          adminData,
          process.env.JWT_SECRET || 'OutingApplication@2026',
          { expiresIn: '1d' }
        );

        return res.json({
          success: true,
          user: adminData,
          token,
        });
      }
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Handle student login with roll number or regular users with email
    let user;
    
    // Check if the email looks like a roll number (contains numbers and letters, no @ symbol)
    const isRollNumber = /^[A-Za-z0-9]+$/.test(email) && !email.includes('@');
    
    console.log('🔍 Login attempt:', { email, isRollNumber });
    
    if (isRollNumber) {
      // Try to find student by roll number in students collection
      console.log('🎓 Searching for student with roll number:', email.toUpperCase());
      user = await Student.findOne({ rollNumber: email.toUpperCase() });
      
      if (!user) {
        // Also try exact case match
        console.log('🎓 Trying exact case match for:', email);
        user = await Student.findOne({ rollNumber: email });
      }
      
      if (user) {
        console.log('✅ Student found:', user.name, user.rollNumber);
      } else {
        console.log('❌ No student found with roll number:', email);
      }
    } else {
      // Try to find user by email (for staff/admin)
      console.log('👨‍💼 Searching for user with email:', email);
      user = await User.findOne({ email });
      
      if (user) {
        console.log('✅ User found:', user.email, user.role);
      } else {
        console.log('❌ No user found with email:', email);
      }
    }

    if (!user) {
      console.log('❌ Login failed: User not found');
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    console.log('🔐 Comparing password for user:', user.name || user.email);
    
    let isMatch = false;
    
    // For student login with roll number
    if (isRollNumber && user.role === 'student') {
      console.log('🎓 Student roll number login detected');
      
      // First try regular password comparison
      isMatch = await bcrypt.compare(password, user.password);
      
      // If regular comparison fails and password equals roll number, 
      // the student is trying to use their roll number as password
      if (!isMatch && password === user.rollNumber) {
        console.log('🔧 Student using roll number as password - allowing login');
        isMatch = true; // Allow login for students using roll number as password
      }
    } else {
      // Regular password comparison for staff/admin users
      isMatch = await bcrypt.compare(password, user.password);
    }
    
    console.log('🔐 Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('❌ Login failed: Invalid credentials');
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    console.log('✅ Login successful for:', user.name || user.email);

    // Prepare token data with proper fallbacks
    const tokenData = {
      id: user._id,
      email: user.email,
      role: user.role,
      hostelBlock: user.hostelBlock,
      floor: user.floor,
      assignedBlock: user.hostelBlock, // Include assignedBlock for compatibility
    };

    // Add role-specific fields
    if (user.role === 'hostel-incharge') {
      tokenData.assignedBlocks = user.assignedBlocks || [user.hostelBlock].filter(Boolean);
      tokenData.isAdmin = true;
    } else if (user.role === 'floor-incharge') {
      tokenData.assignedFloor = user.assignedFloor || [user.floor].filter(Boolean);  
      tokenData.assignedBlocks = [user.hostelBlock].filter(Boolean);
      tokenData.isAdmin = true;
    } else {
      tokenData.assignedBlocks = user.assignedBlocks || [];
      tokenData.assignedFloor = user.assignedFloor || [];
    }

    console.log('🎟️ Creating JWT token for user:', {
      email: user.email,
      role: user.role,
      assignedBlocks: tokenData.assignedBlocks,
      hostelBlock: user.hostelBlock
    });

    const token = jwt.sign(
      tokenData,
      process.env.JWT_SECRET || 'OutingApplication@2026',
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        rollNumber: user.rollNumber,
        phoneNumber: user.phoneNumber,
        parentPhoneNumber: user.parentPhoneNumber,
        hostelBlock: user.hostelBlock,
        floor: user.floor,
        roomNumber: user.roomNumber,
        branch: user.branch,
        semester: user.semester,
        assignedBlocks: tokenData.assignedBlocks, // Include for debugging
        assignedFloor: tokenData.assignedFloor, // Include for debugging
        isAdmin: tokenData.isAdmin // Include for debugging
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update verify endpoint
router.get('/verify', auth, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      isAdmin: req.user.isAdmin || false,
      assignedBlocks: req.user.assignedBlocks || []
    }
  });
});

module.exports = router;