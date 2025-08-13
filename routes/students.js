const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const Student = require('../models/Student');
const DisciplinaryAction = require('../models/DisciplinaryAction');
const Notification = require('../models/Notification');
const { generatePDF } = require('../services/pdfService');

// GET /students/blocks - list students grouped by hostel blocks for hostel incharge
router.get('/blocks', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    // Prefer assignedBlocks (hostel-incharge, warden) fallback to single hostelBlock if present
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
      ? req.user.assignedBlocks
      : (req.user.hostelBlock ? [req.user.hostelBlock] : []);

    if (!assignedBlocks || assignedBlocks.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const students = await Student.find({
      hostelBlock: { $in: assignedBlocks }
    }).select('name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester');

    // Group by block
    const grouped = {};
    assignedBlocks.forEach(block => grouped[block] = []);
    students.forEach(s => {
      const block = s.hostelBlock || 'Unknown';
      if (!grouped[block]) grouped[block] = [];
      grouped[block].push(s);
    });

    return res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('students/blocks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /students/search - search students with disciplinary and suspicious activity details
router.get('/search', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.json({ 
        success: true, 
        students: [],
        message: 'Please provide at least 2 characters to search'
      });
    }

    // Get user's assigned blocks
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
      ? req.user.assignedBlocks
      : (req.user.hostelBlock ? [req.user.hostelBlock] : []);

    if (!assignedBlocks || assignedBlocks.length === 0) {
      return res.json({ success: true, students: [] });
    }

    // Search students by name or roll number
    const searchRegex = new RegExp(query.trim(), 'i');
    const students = await Student.find({
      hostelBlock: { $in: assignedBlocks },
      $or: [
        { name: searchRegex },
        { rollNumber: searchRegex }
      ]
    })
    .select('name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester')
    .limit(parseInt(limit))
    .lean();

    // Get disciplinary actions and suspicious activities for each student
    const studentsWithDetails = await Promise.all(
      students.map(async (student) => {
        try {
          // Get disciplinary actions
          const disciplinaryActions = await DisciplinaryAction.find({
            studentId: student._id
          })
          .select('title description severity category source createdAt gateContext')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();

          // Get suspicious activity notifications (security alerts)
          const suspiciousActivities = await Notification.find({
            userId: student._id,
            type: 'securityAlert'
          })
          .select('title message createdAt referenceId')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();

          // Count total disciplinary actions and suspicious activities
          const [totalDisciplinaryActions, totalSuspiciousActivities] = await Promise.all([
            DisciplinaryAction.countDocuments({ studentId: student._id }),
            Notification.countDocuments({ userId: student._id, type: 'securityAlert' })
          ]);

          return {
            ...student,
            disciplinaryActions,
            suspiciousActivities,
            totalDisciplinaryActions,
            totalSuspiciousActivities,
            riskLevel: calculateRiskLevel(totalDisciplinaryActions, totalSuspiciousActivities)
          };
        } catch (error) {
          console.error(`Error fetching details for student ${student._id}:`, error);
          return {
            ...student,
            disciplinaryActions: [],
            suspiciousActivities: [],
            totalDisciplinaryActions: 0,
            totalSuspiciousActivities: 0,
            riskLevel: 'low'
          };
        }
      })
    );

    res.json({
      success: true,
      students: studentsWithDetails,
      totalFound: studentsWithDetails.length
    });

  } catch (error) {
    console.error('Student search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search students',
      error: error.message 
    });
  }
});

// Helper function to calculate risk level
function calculateRiskLevel(disciplinaryCount, suspiciousCount) {
  const totalIncidents = disciplinaryCount + suspiciousCount;
  
  if (totalIncidents >= 5) return 'high';
  if (totalIncidents >= 2) return 'medium';
  return 'low';
}

// GET /students/:id/details - get detailed student information with disciplinary and suspicious activity history
router.get('/:id/details', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the student
    const student = await Student.findById(id)
      .select('name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if user has access to this student (same hostel block)
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
      ? req.user.assignedBlocks
      : (req.user.hostelBlock ? [req.user.hostelBlock] : []);

    if (!assignedBlocks.includes(student.hostelBlock) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Student not in your assigned blocks'
      });
    }

    // Get all disciplinary actions
    const disciplinaryActions = await DisciplinaryAction.find({
      studentId: student._id
    })
    .select('title description severity category source createdAt gateContext createdBy')
    .populate('createdBy', 'name email role')
    .sort({ createdAt: -1 })
    .lean();

    // Get all suspicious activity notifications
    const suspiciousActivities = await Notification.find({
      userId: student._id,
      type: 'securityAlert'
    })
    .select('title message createdAt referenceId')
    .sort({ createdAt: -1 })
    .lean();

    // Get recent outing requests
    const OutingRequest = require('../models/OutingRequest');
    const recentOutings = await OutingRequest.find({
      studentId: student._id
    })
    .select('outingDate outingTime returnTime status purpose currentLevel createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    // Calculate statistics
    const stats = {
      totalDisciplinaryActions: disciplinaryActions.length,
      totalSuspiciousActivities: suspiciousActivities.length,
      totalOutingRequests: await OutingRequest.countDocuments({ studentId: student._id }),
      approvedOutings: await OutingRequest.countDocuments({ 
        studentId: student._id, 
        status: 'approved' 
      }),
      deniedOutings: await OutingRequest.countDocuments({ 
        studentId: student._id, 
        status: 'denied' 
      }),
      riskLevel: calculateRiskLevel(disciplinaryActions.length, suspiciousActivities.length)
    };

    // Group disciplinary actions by severity
    const disciplinaryBySeverity = {
      high: disciplinaryActions.filter(d => d.severity === 'high').length,
      medium: disciplinaryActions.filter(d => d.severity === 'medium').length,
      low: disciplinaryActions.filter(d => d.severity === 'low').length
    };

    res.json({
      success: true,
      student: {
        ...student,
        disciplinaryActions,
        suspiciousActivities,
        recentOutings,
        stats,
        disciplinaryBySeverity
      }
    });

  } catch (error) {
    console.error('Student details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student details',
      error: error.message
    });
  }
});

// POST /students/register - register a new student
router.post('/register', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const {
      name,
      email,
      rollNumber,
      phoneNumber,
      parentPhoneNumber,
      hostelBlock,
      floor,
      roomNumber,
      branch,
      semester,
      password
    } = req.body;

    // Validation
    const requiredFields = ['name', 'email', 'rollNumber', 'phoneNumber', 'parentPhoneNumber', 'hostelBlock', 'floor', 'roomNumber', 'branch', 'semester'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Check if user has permission to register students in this hostel block
    const userBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
      ? req.user.assignedBlocks
      : (req.user.hostelBlock ? [req.user.hostelBlock] : []);

    if (req.user.role !== 'admin' && req.user.role !== 'warden' && !userBlocks.includes(hostelBlock)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Cannot register students in this hostel block'
      });
    }

    // Check if student with same roll number or email already exists
    const existingStudent = await Student.findOne({
      $or: [
        { rollNumber: rollNumber.trim() },
        { email: email.trim().toLowerCase() }
      ]
    });

    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Student with this roll number or email already exists'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate phone numbers
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be 10 digits'
      });
    }

    if (!phoneRegex.test(parentPhoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Parent phone number must be 10 digits'
      });
    }

    // Create new student
    const newStudent = new Student({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      rollNumber: rollNumber.trim().toUpperCase(),
      phoneNumber: phoneNumber.trim(),
      parentPhoneNumber: parentPhoneNumber.trim(),
      hostelBlock: hostelBlock.trim(),
      floor: Student.formatFloor(floor),
      roomNumber: roomNumber.trim(),
      branch: branch.trim(),
      semester: parseInt(semester),
      password: password || 'student123' // Default password
    });

    await newStudent.save();

    // Create user account for the student
    const User = require('../models/User');
    const bcrypt = require('bcryptjs');
    
    const hashedPassword = await bcrypt.hash(password || 'student123', 10);
    const newUser = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: 'student',
      hostelBlock: hostelBlock.trim(),
      floor: Student.formatFloor(floor),
      isActive: true,
      studentId: newStudent._id
    });

    await newUser.save();

    // Update student with user ID
    newStudent.userId = newUser._id;
    await newStudent.save();

    res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      student: {
        id: newStudent._id,
        name: newStudent.name,
        email: newStudent.email,
        rollNumber: newStudent.rollNumber,
        hostelBlock: newStudent.hostelBlock,
        floor: newStudent.floor,
        roomNumber: newStudent.roomNumber,
        branch: newStudent.branch,
        semester: newStudent.semester
      }
    });

  } catch (error) {
    console.error('Student registration error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Student with this ${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to register student',
      error: error.message
    });
  }
});

// PUT /students/:id - update student details
router.put('/:id', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['name', 'email', 'rollNumber', 'phoneNumber', 'parentPhoneNumber', 'hostelBlock', 'floor', 'roomNumber', 'branch', 'semester'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.floor) {
      update.floor = Student.formatFloor(update.floor);
    }
    const updated = await Student.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, student: updated });
  } catch (error) {
    console.error('students update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /students/:id - delete student
router.delete('/:id', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Student.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('students delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test route to verify students routes are working
router.get('/test-pdf', auth, checkRole(['student']), async (req, res) => {
  res.json({ success: true, message: 'PDF route is accessible' });
});

// GET /students/past-outings/pdf - generate PDF report for student's past outings
router.get('/past-outings/pdf', auth, checkRole(['student']), async (req, res) => {
  try {
    console.log('📄 PDF route accessed by student:', req.user);
    const { startDate, endDate } = req.query;
    const studentId = req.user._id; // For students, req.user is the student object directly

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID not found in user profile'
      });
    }

    // Set default date range if not provided (last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 59, 999);

    // Get student details
    const student = await Student.findById(studentId)
      .select('name rollNumber hostelBlock floor roomNumber branch semester')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get outing requests in date range
    const OutingRequest = require('../models/OutingRequest');
    const outingRequests = await OutingRequest.find({
      studentId: studentId,
      createdAt: {
        $gte: start,
        $lte: end
      }
    })
    .populate('studentId', 'name rollNumber hostelBlock floor roomNumber branch')
    .sort({ createdAt: -1 })
    .lean();

    // Generate statistics
    const statistics = {
      totalRequests: outingRequests.length,
      approvedCount: outingRequests.filter(r => r.status === 'approved').length,
      pendingCount: outingRequests.filter(r => r.status === 'pending').length,
      deniedCount: outingRequests.filter(r => r.status === 'denied').length,
      studentSpecific: {
        studentName: student.name,
        rollNumber: student.rollNumber,
        totalOutings: outingRequests.length,
        approved: outingRequests.filter(r => r.status === 'approved').length,
        pending: outingRequests.filter(r => r.status === 'pending').length,
        denied: outingRequests.filter(r => r.status === 'denied').length
      },
      dateRange: {
        start: start.toLocaleDateString(),
        end: end.toLocaleDateString()
      }
    };

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=my-outing-history-${student.rollNumber}.pdf`);

    // Generate PDF
    generatePDF(res, {
      title: `Outing History - ${student.name} (${student.rollNumber})`,
      requests: outingRequests,
      role: 'student',
      statistics,
      dateRange: {
        start,
        end
      },
      isCustomReport: true
    });

  } catch (error) {
    console.error('Student PDF generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF report',
      error: error.message
    });
  }
});

// GET /students/past-home-permissions/pdf - generate PDF report for student's past home permissions
router.get('/past-home-permissions/pdf', auth, checkRole(['student']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const studentId = req.user._id; // For students, req.user is the student object directly

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID not found in user profile'
      });
    }

    // Set default date range if not provided (last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 59, 999);

    // Get student details
    const student = await Student.findById(studentId)
      .select('name rollNumber hostelBlock floor roomNumber branch semester')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get home permission requests in date range
    const HomePermissionRequest = require('../models/HomePermissionRequest');
    const homeRequests = await HomePermissionRequest.find({
      studentId: studentId,
      createdAt: {
        $gte: start,
        $lte: end
      }
    })
    .populate('studentId', 'name rollNumber hostelBlock floor roomNumber branch')
    .sort({ createdAt: -1 })
    .lean();

    // Generate statistics
    const statistics = {
      totalRequests: homeRequests.length,
      approvedCount: homeRequests.filter(r => r.status === 'approved').length,
      pendingCount: homeRequests.filter(r => r.status === 'pending').length,
      deniedCount: homeRequests.filter(r => r.status === 'denied').length,
      studentSpecific: {
        studentName: student.name,
        rollNumber: student.rollNumber,
        totalOutings: homeRequests.length,
        approved: homeRequests.filter(r => r.status === 'approved').length,
        pending: homeRequests.filter(r => r.status === 'pending').length,
        denied: homeRequests.filter(r => r.status === 'denied').length
      },
      dateRange: {
        start: start.toLocaleDateString(),
        end: end.toLocaleDateString()
      }
    };

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=my-home-permissions-${student.rollNumber}.pdf`);

    // Generate PDF
    generatePDF(res, {
      title: `Home Permission History - ${student.name} (${student.rollNumber})`,
      requests: homeRequests,
      role: 'student',
      statistics,
      dateRange: {
        start,
        end
      },
      isCustomReport: true,
      reportType: 'home'
    });

  } catch (error) {
    console.error('Student home permission PDF generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF report',
      error: error.message
    });
  }
});

// GET /students/:id/details - Get comprehensive student details for hostel incharge
router.get('/:id/details', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedBlocks } = req.user;

    // Get student details
    const student = await Student.findById(id)
      .select('name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check access permissions
    if (assignedBlocks && assignedBlocks.length > 0 && !assignedBlocks.includes(student.hostelBlock)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Student not in your assigned blocks'
      });
    }

    // Get disciplinary actions
    const disciplinaryActions = await DisciplinaryAction.find({
      studentId: id
    })
    .select('title description severity category createdAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

    // Get suspicious activities (notifications)
    const suspiciousActivities = await Notification.find({
      userId: id,
      type: 'securityAlert'
    })
    .select('title message createdAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

    // Get recent outing requests
    const OutingRequest = require('../models/OutingRequest');
    const recentOutings = await OutingRequest.find({
      studentId: id
    })
    .select('purpose outingDate outingTime returnTime status isEmergency createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    // Get recent home permission requests
    const HomePermissionRequest = require('../models/HomePermissionRequest');
    const recentHomePermissions = await HomePermissionRequest.find({
      studentId: id
    })
    .select('purpose startDate endDate status category createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    // Get gate activities if the model exists
    let gateActivities = [];
    try {
      const GateActivity = require('../models/GateActivity');
      gateActivities = await GateActivity.find({
        studentId: id
      })
      .select('type scannedAt location isSuspicious suspiciousComment isEmergency')
      .sort({ scannedAt: -1 })
      .limit(20)
      .lean();
    } catch (error) {
      console.log('GateActivity model not available, skipping gate activities');
    }

    // Compile comprehensive student data
    const comprehensiveData = {
      ...student,
      disciplinaryActions,
      suspiciousActivities,
      recentOutings,
      recentHomePermissions,
      gateActivities,
      statistics: {
        totalOutings: recentOutings.length,
        approvedOutings: recentOutings.filter(o => o.status === 'approved').length,
        pendingOutings: recentOutings.filter(o => o.status === 'pending').length,
        deniedOutings: recentOutings.filter(o => o.status === 'denied').length,
        emergencyOutings: recentOutings.filter(o => o.isEmergency).length,
        totalHomePermissions: recentHomePermissions.length,
        approvedHomePermissions: recentHomePermissions.filter(h => h.status === 'approved').length,
        disciplinaryActionsCount: disciplinaryActions.length,
        suspiciousActivitiesCount: suspiciousActivities.length,
        gateActivitiesCount: gateActivities.length
      }
    };

    res.json({
      success: true,
      student: comprehensiveData
    });

  } catch (error) {
    console.error('Student details fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student details',
      error: error.message
    });
  }
});

module.exports = router;


