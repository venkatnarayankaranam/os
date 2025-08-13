const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const OutingRequest = require('../models/OutingRequest');
const User = require('../models/User');
const { auth, checkRole } = require('../middleware/auth');
const { generatePDF, generateGateActivityPDF } = require('../services/pdfService');

// Gate Dashboard - Get current activity and statistics
router.get('/dashboard', auth, checkRole(['security', 'admin', 'warden', 'gate']), async (req, res) => {
  try {
    console.log('📊 Gate Dashboard requested by:', req.user.email, req.user.role);
    
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    console.log('📅 Date range:', { startOfDay, endOfDay });

    // Get today's gate activity from both outing and home permission requests
    const [todayOutingActivity, todayHomePermissionActivity] = await Promise.all([
      OutingRequest.find({
        'gateActivity.scannedAt': {
          $gte: startOfDay,
          $lte: endOfDay
        }
      })
      .populate({
        path: 'studentId',
        model: 'Student',
        select: 'name rollNumber hostelBlock floor roomNumber phoneNumber'
      })
      .sort({ 'gateActivity.scannedAt': -1 })
      .exec(),
      
      // Also get home permission activities
      (() => {
        const HomePermissionRequest = require('../models/HomePermissionRequest');
        return HomePermissionRequest.find({
          'gateActivity.scannedAt': {
            $gte: startOfDay,
            $lte: endOfDay
          }
        })
        .populate({
        path: 'studentId',
        model: 'Student',
        select: 'name rollNumber hostelBlock floor roomNumber phoneNumber'
      })
        .sort({ 'gateActivity.scannedAt': -1 })
        .exec();
      })()
    ]);
    
    const todayActivity = [...todayOutingActivity, ...todayHomePermissionActivity];

    console.log('🎯 Found outing requests with gate activity:', todayOutingActivity.length);
    console.log('🎯 Found home permission requests with gate activity:', todayHomePermissionActivity.length);
    console.log('🎯 Total requests with gate activity:', todayActivity.length);

    // Flatten gate activity for easier display
    const activityLog = [];
    todayActivity.forEach(request => {
      if (request.gateActivity && request.gateActivity.length > 0) {
        request.gateActivity.forEach(activity => {
          const activityDate = new Date(activity.scannedAt);
          if (activityDate >= startOfDay && activityDate <= endOfDay) {
            // Determine if this is a home permission request
            const isHomePermission = request.homeTownName !== undefined || request.goingDate !== undefined;
            
            activityLog.push({
              id: `${request._id}_${activity._id}`,
              student: request.studentId,
              type: activity.type,
              scannedAt: activity.scannedAt,
              location: activity.location || 'Main Gate',
              purpose: request.purpose,
              remarks: activity.remarks,
              qrType: activity.qrType,
              requestType: isHomePermission ? 'home-permission' : 'outing',
              // Include additional info for home permissions
              ...(isHomePermission && {
                homeTownName: request.homeTownName,
                goingDate: request.goingDate,
                incomingDate: request.incomingDate
              }),
              // Include additional info for outings
              ...(!isHomePermission && {
                outingDate: request.outingDate,
                outingTime: request.outingTime,
                returnTime: request.returnTime
              })
            });
          }
        });
      }
    });

    console.log('📝 Total activity log entries:', activityLog.length);

    // Sort by scan time (most recent first)
    activityLog.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));

    // Get comprehensive statistics
    const stats = {
      studentsOut: 0,
      studentsIn: 0,
      currentlyOut: 0,
      pendingReturn: 0
    };

    // Calculate current status by looking at the most recent activity for each student
    const studentStatus = new Map();
    
    activityLog.forEach(activity => {
      const studentId = activity.student?._id?.toString();
      if (studentId) {
        const currentActivity = studentStatus.get(studentId);
        if (!currentActivity || new Date(activity.scannedAt) > new Date(currentActivity.scannedAt)) {
          studentStatus.set(studentId, activity);
        }
      }
    });

    // Count based on most recent activity per student
    studentStatus.forEach(activity => {
      if (activity.type === 'OUT' || activity.type === 'OUTGOING') {
        stats.studentsOut++;
        stats.currentlyOut++;
      } else if (activity.type === 'IN' || activity.type === 'INCOMING') {
        stats.studentsIn++;
        // Student returned, so they're not currently out
        // Note: currentlyOut is only incremented for OUT activities above
      }
    });

    console.log('👥 Student status map:', Array.from(studentStatus.values()).map(a => ({
      student: a.student?.name,
      type: a.type,
      time: a.scannedAt
    })));

    // Get pending returns (students who went out but haven't returned)
    const outgoingRequests = await OutingRequest.find({
      status: 'approved',
      'qrCode.outgoing.isExpired': false,
      outingDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).countDocuments();

    stats.pendingReturn = Math.max(0, stats.currentlyOut);

    console.log('📊 Calculated stats:', stats);
    
    res.json({
      success: true,
      data: {
        activity: activityLog,
        stats: stats,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Gate dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gate dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Student search endpoint
router.get('/search-students', auth, checkRole(['security', 'admin', 'warden', 'gate']), async (req, res) => {
  try {
    const { q } = req.query;
    console.log('🔍 Student search query:', q);

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const User = require('../models/User');
    const Student = require('../models/Student');
    const searchQuery = q.trim();
    
    // Search by name or roll number in both User and Student models
    const [userStudents, modelStudents] = await Promise.all([
      User.find({
        role: 'student',
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { rollNumber: { $regex: searchQuery, $options: 'i' } }
        ]
      }).select('name rollNumber hostelBlock roomNumber phoneNumber').limit(10),
      
      Student.find({
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { rollNumber: { $regex: searchQuery, $options: 'i' } }
        ]
      }).select('name rollNumber hostelBlock roomNumber phoneNumber').limit(10)
    ]);
    
    // Combine results and remove duplicates by ID
    const studentMap = new Map();
    [...userStudents, ...modelStudents].forEach(student => {
      studentMap.set(student._id.toString(), student);
    });
    const students = Array.from(studentMap.values()).slice(0, 10);

    console.log(`📋 Found ${students.length} students matching "${searchQuery}"`);

    res.json({
      success: true,
      data: students
    });

  } catch (error) {
    console.error('Student search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search students'
    });
  }
});

// Currently out students endpoint - USES EXACT SAME LOGIC AS DASHBOARD
router.get('/currently-out', auth, checkRole(['security', 'admin', 'warden', 'gate']), async (req, res) => {
  try {
    console.log('👥 Fetching currently out students - using dashboard logic...');

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    console.log('📅 Date range:', {
      start: startOfDay.toISOString(),
      end: endOfDay.toISOString()
    });

    // EXACT SAME LOGIC AS DASHBOARD - Find all requests and build activity log
    const allRequests = await OutingRequest.find({}).populate('studentId', 'name rollNumber hostelBlock roomNumber phoneNumber');
    console.log(`🎯 Found ${allRequests.length} total requests`);

    const activityLog = [];
    let requestsWithActivity = 0;

    allRequests.forEach(request => {
      if (request.gateActivity && request.gateActivity.length > 0) {
        let hasActivityToday = false;
        request.gateActivity.forEach(activity => {
          const activityDate = new Date(activity.scannedAt);
          if (activityDate >= startOfDay && activityDate < endOfDay) {
            hasActivityToday = true;
            activityLog.push({
              student: request.studentId,
              type: activity.type,
              scannedAt: activity.scannedAt,
              purpose: request.purpose,
              location: activity.location
            });
          }
        });
        if (hasActivityToday) requestsWithActivity++;
      }
    });

    console.log(`🎯 Found requests with gate activity today: ${requestsWithActivity}`);
    console.log(`📝 Total activity log entries: ${activityLog.length}`);

    // EXACT SAME LOGIC AS DASHBOARD - Calculate current status by looking at most recent activity per student
    const studentStatus = new Map();
    
    activityLog.forEach(activity => {
      const studentId = activity.student?._id?.toString();
      if (studentId) {
        const currentActivity = studentStatus.get(studentId);
        if (!currentActivity || new Date(activity.scannedAt) > new Date(currentActivity.scannedAt)) {
          studentStatus.set(studentId, activity);
        }
      }
    });

    console.log('👥 Student status map:', Array.from(studentStatus.values()).map(a => ({
      student: a.student?.name,
      type: a.type,
      time: a.scannedAt
    })));

    // Filter only students who are currently out (most recent activity is OUT)
    const currentlyOut = [];
    studentStatus.forEach(activity => {
      if (activity.type === 'OUT' || activity.type === 'OUTGOING') {
        currentlyOut.push({
          _id: activity.student._id,
          name: activity.student.name,
          rollNumber: activity.student.rollNumber,
          hostelBlock: activity.student.hostelBlock,
          roomNumber: activity.student.roomNumber,
          outTime: activity.scannedAt,
          purpose: activity.purpose
        });
      }
    });

    console.log(`📊 Currently out students: ${currentlyOut.length}`);

    res.json({
      success: true,
      data: currentlyOut
    });

  } catch (error) {
    console.error('❌ Currently out students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch currently out students',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Manual check-in endpoint
router.post('/manual-checkin', auth, checkRole(['security', 'admin', 'warden', 'gate']), async (req, res) => {
  try {
    const { studentId, location = 'Main Gate', isSuspicious = false, suspiciousComment } = req.body;
    console.log('📥 Manual check-in request:', { 
      studentId, 
      location, 
      isSuspicious,
      suspiciousComment,
      bodyReceived: req.body,
      userRole: req.user?.role 
    });

    if (!studentId) {
      console.log('❌ Student ID missing in request');
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    const User = require('../models/User');
    const Student = require('../models/Student');
    
    // Find the gate user's ObjectId by email
    let gateUserId = req.user.id;
    if (typeof req.user.id === 'string' && req.user.id.includes('@')) {
      const gateUser = await User.findOne({ email: req.user.id });
      if (gateUser) {
        gateUserId = gateUser._id;
      }
    }

    // Find the student - check both User and Student models
    console.log('🔍 Looking for student with ID:', studentId);
    let student = await Student.findById(studentId);
    if (!student) {
      student = await User.findById(studentId);
    }
    console.log('👤 Student found:', student ? `${student.name} (${student.role || 'student'})` : 'Not found');
    
    if (!student || (student.role && student.role !== 'student')) {
      console.log('❌ Student not found or not a student role');
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Use EXACT SAME logic as dashboard and currently-out endpoints
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    console.log('📅 Manual check-in date range:', {
      start: startOfDay.toISOString(),
      end: endOfDay.toISOString()
    });
    
    // EXACT SAME LOGIC AS DASHBOARD - Find all requests for this student
    const allRequests = await OutingRequest.find({ studentId: studentId }).populate('studentId', 'name rollNumber');
    console.log(`🎯 Found ${allRequests.length} total requests for student`);
    
    // Build activity log for this student (same as dashboard logic)
    const activityLog = [];
    let requestsWithActivity = 0;

    allRequests.forEach(request => {
      if (request.gateActivity && request.gateActivity.length > 0) {
        let hasActivityToday = false;
        request.gateActivity.forEach(activity => {
          const activityDate = new Date(activity.scannedAt);
          if (activityDate >= startOfDay && activityDate < endOfDay) {
            hasActivityToday = true;
            activityLog.push({
              request: request,
              type: activity.type,
              scannedAt: activity.scannedAt,
              location: activity.location
            });
          }
        });
        if (hasActivityToday) requestsWithActivity++;
      }
    });
    
    console.log(`🎯 Found requests with gate activity today: ${requestsWithActivity}`);
    console.log(`📝 Total activity log entries: ${activityLog.length}`);
    console.log('🏃 All activities for student today:', activityLog.map(a => ({ 
      type: a.type, 
      time: a.scannedAt.toISOString() 
    })));
    
    // Handle cases where student has no gate activity today (manual check-in scenarios)
    let outgoingRequest = null;
    let mostRecentActivity = null;
    
    if (activityLog.length === 0) {
      console.log('⚠️ No gate activities found for student today - checking for existing approved requests');
      
      // For manual check-ins, find any approved request that could be the basis for check-in
      const approvedRequests = await OutingRequest.find({ 
        studentId: studentId,
        status: 'approved',
        outingDate: {
          $gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          $lte: endOfDay
        }
      }).sort({ createdAt: -1 }).limit(1);
      
      if (approvedRequests.length === 0) {
        console.log('❌ No approved outing requests found for student');
        return res.status(400).json({
          success: false,
          message: 'No approved outing requests found for this student. Student must have an approved outing request to check in.'
        });
      }
      
      outgoingRequest = approvedRequests[0];
      console.log('✅ Found approved request for manual check-in:', outgoingRequest._id);
    } else {
      // Sort by time and get the most recent (same as dashboard logic)
      activityLog.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
      mostRecentActivity = activityLog[0];
      
      console.log('🎯 Most recent activity:', {
        type: mostRecentActivity.type,
        time: mostRecentActivity.scannedAt.toISOString()
      });
      
      // Check if student is currently out (most recent activity is OUT)
      if (mostRecentActivity.type !== 'OUT' && mostRecentActivity.type !== 'OUTGOING') {
        console.log('❌ Student is not currently out - most recent activity is:', mostRecentActivity.type);
        return res.status(400).json({
          success: false,
          message: 'Student is not currently out (most recent activity is check-in)'
        });
      }
      
      outgoingRequest = mostRecentActivity.request;
    }
    
    console.log('✅ Valid check-in request found:', {
      studentName: student.name,
      outingPurpose: outgoingRequest.purpose,
      mostRecentOut: mostRecentActivity.scannedAt,
      request: outgoingRequest._id,
      isSuspicious
    });
    
    // Validate suspicious activity comment
    if (isSuspicious && (!suspiciousComment || !suspiciousComment.trim())) {
      console.log('❌ Suspicious activity flagged but no comment provided');
      return res.status(400).json({
        success: false,
        message: 'Comment is required for suspicious activity'
      });
    }

    // Add check-in activity with current timestamp
    const checkInTime = new Date();
    const newActivity = {
      type: 'IN',
      scannedAt: checkInTime,
      scannedBy: gateUserId,
      qrType: 'incoming', // Use valid enum value instead of 'manual'
      location: location,
      remarks: isSuspicious ? 'Manual check-in by security - SUSPICIOUS ACTIVITY REPORTED' : 'Manual check-in by security'
    };

    // Only add suspicious fields if they have values
    if (isSuspicious) {
      newActivity.isSuspicious = true;
      if (suspiciousComment) {
        newActivity.suspiciousComment = suspiciousComment;
        newActivity.securityComment = suspiciousComment;
      }
    }
    
    console.log('📥 Adding check-in activity:', newActivity);
    outgoingRequest.gateActivity.push(newActivity);

    try {
      await outgoingRequest.save();
      console.log('💾 Saved check-in activity to database');
    } catch (saveError) {
      console.error('❌ Database save error:', saveError);
      console.error('❌ Failed to save activity:', newActivity);
      throw new Error(`Database save failed: ${saveError.message}`);
    }

    console.log('✅ Manual check-in successful for:', student.name, 'at', checkInTime.toISOString(), isSuspicious ? '(SUSPICIOUS ACTIVITY)' : '');

    // If suspicious, create a disciplinary action and notify student
    if (isSuspicious) {
      try {
        const DisciplinaryAction = require('../models/DisciplinaryAction');
        const Notification = require('../models/Notification');
        const action = await DisciplinaryAction.create({
          studentId: student._id,
          createdBy: gateUserId,
          createdByRole: req.user?.role,
          source: 'gate',
          category: 'security',
          title: 'Suspicious activity at gate',
          description: suspiciousComment || 'Reported by security at gate',
          severity: 'medium',
          gateContext: {
            outingRequestId: outgoingRequest._id,
            gateActivityId: outgoingRequest.gateActivity[outgoingRequest.gateActivity.length - 1]?._id,
            comment: suspiciousComment,
            location,
            scannedAt: checkInTime,
          }
        });
        const notif = await Notification.create({
          userId: student._id,
          title: 'Security Alert',
          message: `A security alert was recorded at the gate: ${suspiciousComment || 'See details in your dashboard.'}`,
          type: 'securityAlert',
          referenceId: action._id,
        });
        // Also notify hostel incharge(s) for this block
        try {
          const User = require('../models/User');
          const { getIO } = require('../config/socket');
          const his = await User.find({ role: 'hostel-incharge', hostelBlock: student.hostelBlock });
          for (const hi of his) {
            await Notification.create({
              userId: hi._id,
              title: 'Suspicious Activity Near Gate',
              message: `${student.name} (${student.rollNumber}) flagged at ${location}. ${suspiciousComment || ''}`.trim(),
              type: 'securityAlert',
              referenceId: action._id,
            });
            try {
              getIO().of('/hostel-incharge').to(hi._id.toString()).emit('notification', {
                title: 'Suspicious Activity Near Gate',
                message: `${student.name} (${student.rollNumber}) at ${location}.`,
                type: 'securityAlert',
                createdAt: new Date().toISOString()
              });
            } catch {}
          }
        } catch (e) {
          console.error('Failed to notify hostel incharge for suspicious activity:', e);
        }
      } catch (discErr) {
        console.error('Failed to create disciplinary action/notification for suspicious activity:', discErr);
      }
    }

    res.json({
      success: true,
      message: isSuspicious 
        ? `${student.name} checked in successfully with security alert at ${checkInTime.toLocaleTimeString()}`
        : `${student.name} checked in successfully at ${checkInTime.toLocaleTimeString()}`,
      data: {
        student: {
          name: student.name,
          rollNumber: student.rollNumber,
          hostelBlock: student.hostelBlock,
          roomNumber: student.roomNumber
        },
        checkInTime: checkInTime,
        location: location,
        isSuspicious: isSuspicious,
        suspiciousComment: isSuspicious ? suspiciousComment : undefined,
        activity: {
          type: 'IN',
          scannedAt: checkInTime,
          location: location,
          isSuspicious: isSuspicious,
          suspiciousComment: isSuspicious ? suspiciousComment : undefined
        }
      }
    });

  } catch (error) {
    console.error('❌ Manual check-in error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request details:', {
      studentId: req.body.studentId,
      isSuspicious: req.body.isSuspicious,
      suspiciousComment: req.body.suspiciousComment,
      userRole: req.user?.role
    });
    
    res.status(500).json({
      success: false,
      message: `Failed to process manual check-in: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
});

// TEMPORARY: Simple manual check-in for debugging
router.post('/manual-checkin-debug', auth, async (req, res) => {
  try {
    const { studentId, location = 'Main Gate Debug' } = req.body;
    console.log('🔧 DEBUG Manual check-in:', { studentId, location, body: req.body });

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    const User = require('../models/User');
    const student = await User.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    console.log('🎯 DEBUG: Would check in student:', student.name);

    // For now, just return success without actually updating database
    res.json({
      success: true,
      message: `DEBUG: ${student.name} would be checked in successfully`,
      data: {
        student: {
          name: student.name,
          rollNumber: student.rollNumber,
          hostelBlock: student.hostelBlock,
          roomNumber: student.roomNumber
        },
        checkInTime: new Date(),
        location: location
      }
    });

  } catch (error) {
    console.error('DEBUG manual check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process debug manual check-in'
    });
  }
});

// TEMPORARY: QR scan without strict auth for debugging  
router.post('/scan-debug', async (req, res) => {
  try {
    const { qrData, location = 'Main Gate (Debug)' } = req.body;
    console.log('=== DEBUG GATE SCAN REQUEST ===');
    console.log('Request body:', req.body);
    console.log('QR Data:', qrData);
    console.log('Location:', location);

    if (!qrData) {
      console.log('❌ No QR data provided');
      return res.status(400).json({
        success: false,
        message: 'QR data is required'
      });
    }

    let qrId;
    let parsedQR = null;

    // Handle both JSON format and simple QR ID format
    if (typeof qrData === 'object') {
      qrId = qrData.qrId;
    } else if (qrData.startsWith('{')) {
      // JSON format
      try {
        parsedQR = JSON.parse(qrData);
        qrId = parsedQR.qrId;
        console.log('Parsed JSON QR:', { qrId });
      } catch (error) {
        console.log('JSON parse error:', error.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid QR code JSON format'
        });
      }
    } else {
      // Simple QR ID format
      qrId = qrData.trim();
      console.log('Simple QR ID:', qrId);
    }

    if (!qrId) {
      console.log('No QR ID found');
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code - missing QR ID'
      });
    }

    // Check QR type from the QR data or ID
    const qrType = parsedQR?.type || (qrId.includes('home-') ? 'home-permission' : 'outing');
    console.log('🏷️ Debug QR Type detected:', qrType);

    let request = null;
    let isHomePermission = false;

    // Try to find outing request first
    if (qrType !== 'home-permission') {
      request = await OutingRequest.findByQRId(qrId);
    }

    // If not found in outing requests or explicitly home permission, try home permission requests
    if (!request || qrType.includes('home-permission')) {
      const HomePermissionRequest = require('../models/HomePermissionRequest');
      
      const homePermissionRequest = await HomePermissionRequest.findOne({
        $or: [
          { 'qrCode.outgoing.qrId': qrId },
          { 'qrCode.incoming.qrId': qrId }
        ]
      }).populate('studentId', 'name rollNumber hostelBlock floor roomNumber phoneNumber');

      if (homePermissionRequest) {
        request = homePermissionRequest;
        isHomePermission = true;
        console.log('✅ Home permission request found for debug scan:', homePermissionRequest._id);
      }
    }

    console.log('Request found for debug scan:', request ? 'Yes' : 'No', isHomePermission ? '(Home Permission)' : '(Outing)');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found or invalid'
      });
    }

    // Use a dummy user ID for debugging
    const dummyUserId = '507f1f77bcf86cd799439011'; // Valid ObjectId format
    console.log('Attempting to scan QR (DEBUG):', { qrId, userId: dummyUserId, location, isHomePermission });
    
    let scanResult;
    
    if (isHomePermission) {
      // Handle home permission scanning logic (similar to main endpoint)
      let scanType = 'UNKNOWN';
      let qrType = 'outgoing';
      let qrDetails = null;
      
      if (request.qrCode.outgoing?.qrId === qrId) {
        scanType = 'OUT';
        qrType = 'outgoing';
        qrDetails = request.qrCode.outgoing;
      } else if (request.qrCode.incoming?.qrId === qrId) {
        scanType = 'IN';
        qrType = 'incoming';
        qrDetails = request.qrCode.incoming;
      }
      
      // Validate that QR hasn't been used already (same as main endpoint)
      if (qrDetails && qrDetails.isExpired) {
        return res.status(400).json({
          success: false,
          message: 'This QR code has already been used and is no longer valid (Debug)'
        });
      }
      
      if (qrDetails && qrDetails.scannedAt) {
        return res.status(400).json({
          success: false,
          message: 'This QR code has already been scanned and cannot be used again (Debug)'
        });
      }
      
      // Validate request status
      if (request.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Home permission request is not approved (Debug)'
        });
      }
      
      // Check time-based expiration
      if (qrDetails && qrDetails.validUntil && new Date() > new Date(qrDetails.validUntil)) {
        return res.status(400).json({
          success: false,
          message: 'QR code has expired (Debug)'
        });
      }
      
      // Create gate activity entry for home permission
      const gateActivity = {
        type: scanType,
        scannedAt: new Date(),
        location: location,
        scannedBy: dummyUserId,
        qrType: qrType
      };
      
      // Add gate activity to request
      if (!request.gateActivity) {
        request.gateActivity = [];
      }
      request.gateActivity.push(gateActivity);
      
      // Mark QR as used and expired
      if (scanType === 'OUT' && request.qrCode.outgoing) {
        request.qrCode.outgoing.isExpired = true;
        request.qrCode.outgoing.scannedAt = new Date();
      } else if (scanType === 'IN' && request.qrCode.incoming) {
        request.qrCode.incoming.isExpired = true;
        request.qrCode.incoming.scannedAt = new Date();
      }
      
      await request.save();
      
      scanResult = {
        type: scanType,
        message: `Home permission ${scanType.toLowerCase()} scan successful (DEBUG)`,
        student: {
          name: request.studentId.name,
          rollNumber: request.studentId.rollNumber,
          hostelBlock: request.studentId.hostelBlock,
          floor: request.studentId.floor,
          roomNumber: request.studentId.roomNumber
        },
        scannedAt: gateActivity.scannedAt,
        location: location,
        requestType: 'home-permission',
        // Home permission specific data
        homePermission: {
          homeTownName: request.homeTownName,
          goingDate: request.goingDate,
          incomingDate: request.incomingDate,
          purpose: request.purpose,
          status: request.status
        }
      };
    } else {
      // Original outing request scanning logic
      if (typeof request.scanQR !== 'function') {
        console.error('scanQR method not found on request object');
        return res.status(500).json({
          success: false,
          message: 'Server error: scan method not available'
        });
      }
      
      scanResult = await request.scanQR(qrId, dummyUserId, location);
      scanResult.requestType = 'outing';
    }
    
    console.log('Debug scan result:', scanResult);

    // Prepare response data based on request type
    const responseData = {
      ...scanResult,
      request: isHomePermission ? {
        id: request._id,
        purpose: request.purpose,
        goingDate: request.goingDate,
        incomingDate: request.incomingDate,
        homeTownName: request.homeTownName,
        requestType: 'home-permission'
      } : {
        id: request._id,
        purpose: request.purpose,
        outingDate: request.outingDate,
        outingTime: request.outingTime,
        returnTime: request.returnTime,
        requestType: 'outing'
      },
      debugMode: true
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('DEBUG QR scan error:', error);
    console.error('DEBUG QR scan error stack:', error.stack);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to scan QR code',
      debugMode: true
    });
  }
});

// Simple test endpoint to verify routing is working
router.post('/qr/test', (req, res) => {
  console.log('🧪 TEST endpoint hit!');
  res.json({ success: true, message: 'Test endpoint working', data: req.body });
});

// Validate QR Code (check if valid without scanning)
router.post('/qr/validate', auth, checkRole(['security', 'admin', 'warden', 'gate']), async (req, res) => {
  try {
    const { qrData } = req.body;
    console.log('=== QR VALIDATION REQUEST ===');
    console.log('QR Data:', qrData);

    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: 'QR data is required'
      });
    }

    let qrId;
    let parsedQR = null;

    // Handle all QR data formats safely
    if (typeof qrData === 'object' && qrData !== null) {
      qrId = qrData.qrId;
    } else if (typeof qrData === 'string') {
      if (qrData.startsWith('{')) {
        try {
          parsedQR = JSON.parse(qrData);
          qrId = parsedQR.qrId;
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid QR code JSON format'
          });
        }
      } else {
        qrId = qrData.trim();
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR data format'
      });
    }

    if (!qrId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code - missing QR ID'
      });
    }

    // Check QR type from the QR data or ID
    const qrType = parsedQR?.type || (qrId.includes('home-') ? 'home-permission' : 'outing');
    console.log('🏷️ QR Type detected:', qrType);

    // Check if this is a home permission request
    const isHomePermissionQR = qrType.includes('home-permission') || qrId.includes('home-');
    console.log('🏠 Is Home Permission QR:', isHomePermissionQR);

    let request = null;
    let isHomePermission = false;

    // Try to find outing request first (only if NOT a home permission QR)
    if (!isHomePermissionQR) {
      request = await OutingRequest.findByQRId(qrId);
    }

    // If not found in outing requests OR explicitly home permission, try home permission requests
    if (!request || isHomePermissionQR) {
      const HomePermissionRequest = require('../models/HomePermissionRequest');
      
      const homePermissionRequest = await HomePermissionRequest.findOne({
        $or: [
          { 'qrCode.outgoing.qrId': qrId },
          { 'qrCode.incoming.qrId': qrId }
        ]
      }).populate('studentId', 'name rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber');

      if (homePermissionRequest) {
        request = homePermissionRequest;
        isHomePermission = true;
        console.log('✅ Home permission request found:', homePermissionRequest._id);
      }
    }

    console.log('Request found:', request ? 'Yes' : 'No', isHomePermission ? '(Home Permission)' : '(Outing)');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found or invalid'
      });
    }

    // Validate if the QR code can be used
    const now = new Date();
    let isValid = true;
    let canScan = true;
    let validationMessage = '';
    let qrDetails = null;

    if (isHomePermission) {
      // Home permission validation logic
      const isOutgoing = qrId.includes('OUT') || (request.qrCode.outgoing && request.qrCode.outgoing.qrId === qrId);
      
      if (isOutgoing) {
        qrDetails = request.qrCode.outgoing;
        validationMessage = 'Home Permission - Outgoing';
      } else {
        qrDetails = request.qrCode.incoming;
        validationMessage = 'Home Permission - Incoming';
      }

      // Check if home permission is valid
      if (request.status !== 'approved') {
        isValid = false;
        canScan = false;
        validationMessage = 'Home permission not approved';
      }
    } else {
      // Outing validation logic
      const isOutgoing = qrId.includes('OUT') || (request.qrCode.outgoing && request.qrCode.outgoing.qrId === qrId);
      
      if (isOutgoing) {
        qrDetails = request.qrCode.outgoing;
        validationMessage = 'Outing - Outgoing';
      } else {
        qrDetails = request.qrCode.incoming;
        validationMessage = 'Outing - Incoming';
      }

      // Check if outing is valid
      if (request.status !== 'approved') {
        isValid = false;
        canScan = false;
        validationMessage = 'Outing request not approved';
      }
    }

    // Check if QR has already been scanned/used
    if (qrDetails && qrDetails.isExpired) {
      isValid = false;
      canScan = false;
      validationMessage = 'QR code has already been used';
    }
    
    // Check if QR has been scanned (additional check)
    if (qrDetails && qrDetails.scannedAt) {
      isValid = false;
      canScan = false;
      validationMessage = 'QR code has already been scanned';
    }

    // Check expiration
    if (qrDetails && qrDetails.validUntil && now > new Date(qrDetails.validUntil)) {
      isValid = false;
      canScan = false;
      validationMessage = 'QR code has expired';
    }

    // Determine the correct type for client consumption
    const isOutgoing = qrId.includes('OUT') || (qrDetails && qrDetails === request.qrCode?.outgoing);
    const clientType = isOutgoing ? 'OUT' : 'IN';

    // Format the response according to client expectations
    const validationResult = {
      student: {
        name: request.studentId.name,
        rollNumber: request.studentId.rollNumber,
        hostelBlock: request.studentId.hostelBlock || '',
        floor: request.studentId.floor || '',
        roomNumber: request.studentId.roomNumber || '',
        phoneNumber: request.studentId.phoneNumber || '',
        parentPhoneNumber: request.studentId.parentPhoneNumber || ''
      },
      outing: isHomePermission ? {
        date: request.goingDate ? new Date(request.goingDate).toISOString().split('T')[0] : '',
        outingTime: request.goingDate ? new Date(request.goingDate).toLocaleTimeString() : '',
        returnTime: request.incomingDate ? new Date(request.incomingDate).toLocaleTimeString() : '',
        purpose: `Home to ${request.homeTownName || 'Home'}`
      } : {
        date: request.outingDate ? new Date(request.outingDate).toISOString().split('T')[0] : '',
        outingTime: request.outingTime || '',
        returnTime: request.returnTime || '',
        purpose: request.purpose || ''
      },
      type: clientType,
      isValid: isValid,
      validUntil: qrDetails ? qrDetails.validUntil : '',
      canScan: canScan
    };

    console.log('✅ QR validation result:', { 
      isValid, 
      canScan, 
      type: validationMessage,
      studentName: request.studentId.name 
    });

    res.json({
      success: true,
      data: validationResult
    });

  } catch (error) {
    console.error('❌ QR validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate QR code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Scan QR Code
router.post('/scan', auth, checkRole(['security', 'admin', 'warden', 'gate']), async (req, res) => {
  try {
    const { qrData, location = 'Main Gate' } = req.body;
    console.log('=== GATE SCAN REQUEST ===');
    console.log('Request body:', req.body);
    console.log('User:', req.user);
    console.log('QR Data:', qrData);
    console.log('Location:', location);

    if (!qrData) {
      console.log('❌ No QR data provided');
      return res.status(400).json({
        success: false,
        message: 'QR data is required'
      });
    }

    let qrId;
    let parsedQR = null;

    // Handle all QR data formats safely
    if (typeof qrData === 'object' && qrData !== null) {
      // Direct object format
      qrId = qrData.qrId;
      console.log('🔍 Object format QR ID:', qrId);
    } else if (typeof qrData === 'string') {
      if (qrData.startsWith('{')) {
        // JSON string format
        try {
          parsedQR = JSON.parse(qrData);
          qrId = parsedQR.qrId;
          console.log('🔍 Parsed JSON QR:', { qrId });
        } catch (error) {
          console.log('JSON parse error:', error.message);
          return res.status(400).json({
            success: false,
            message: 'Invalid QR code JSON format'
          });
        }
      } else {
        // Simple QR ID string format
        qrId = qrData.trim();
        console.log('🔍 Simple QR ID:', qrId);
      }
    } else {
      console.log('❌ Invalid QR data type:', typeof qrData);
      return res.status(400).json({
        success: false,
        message: 'Invalid QR data format'
      });
    }

    if (!qrId) {
      console.log('No QR ID found');
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code - missing QR ID'
      });
    }

    // Check QR type from the QR data or ID
    const qrType = parsedQR?.type || (qrId.includes('home-') ? 'home-permission' : 'outing');
    console.log('🏷️ QR Type detected for scan:', qrType);

    let request = null;
    let isHomePermission = false;

    // Try to find outing request first
    if (qrType !== 'home-permission') {
      request = await OutingRequest.findByQRId(qrId);
    }

    // If not found in outing requests or explicitly home permission, try home permission requests
    if (!request || qrType.includes('home-permission')) {
      const HomePermissionRequest = require('../models/HomePermissionRequest');
      
      const homePermissionRequest = await HomePermissionRequest.findOne({
        $or: [
          { 'qrCode.outgoing.qrId': qrId },
          { 'qrCode.incoming.qrId': qrId }
        ]
      }).populate('studentId', 'name rollNumber hostelBlock floor roomNumber phoneNumber');

      if (homePermissionRequest) {
        request = homePermissionRequest;
        isHomePermission = true;
        console.log('✅ Home permission request found for scan:', homePermissionRequest._id);
      }
    }

    console.log('Request found for scan:', request ? 'Yes' : 'No', isHomePermission ? '(Home Permission)' : '(Outing)');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found or invalid'
      });
    }

    // Handle different request types
    if (isHomePermission) {
      // Handle home permission scanning differently
      console.log('Processing home permission scan...');
    } else {
      // Check if scanQR method exists for outing requests
      if (typeof request.scanQR !== 'function') {
        console.error('scanQR method not found on request object');
        return res.status(500).json({
          success: false,
          message: 'Server error: scan method not available'
        });
      }
    }

    // Find the gate user's ObjectId by email
    const User = require('../models/User');
    let gateUserId = req.user.id;
    
    // If req.user.id is an email (like maingate@kietgroup.com), find the actual ObjectId
    if (typeof req.user.id === 'string' && req.user.id.includes('@')) {
      console.log('🔍 Looking up gate user ObjectId for email:', req.user.id);
      const gateUser = await User.findOne({ email: req.user.id });
      if (gateUser) {
        gateUserId = gateUser._id;
        console.log('✅ Found gate user ObjectId:', gateUserId);
      } else {
        console.log('❌ Gate user not found in database');
        return res.status(400).json({
          success: false,
          message: 'Gate user not found in database'
        });
      }
    }

    // Handle scanning based on request type
    let scanResult;
    
    if (isHomePermission) {
      // Implement home permission scanning logic
      console.log('Attempting to scan home permission QR:', { qrId, userId: gateUserId, location });
      
      // Determine scan type based on QR ID
      let scanType = 'UNKNOWN';
      let qrType = 'outgoing';
      let qrDetails = null;
      
      if (request.qrCode.outgoing?.qrId === qrId) {
        scanType = 'OUT';
        qrType = 'outgoing';
        qrDetails = request.qrCode.outgoing;
      } else if (request.qrCode.incoming?.qrId === qrId) {
        scanType = 'IN';
        qrType = 'incoming';
        qrDetails = request.qrCode.incoming;
      }
      
      // Validate that QR hasn't been used already
      if (qrDetails && qrDetails.isExpired) {
        return res.status(400).json({
          success: false,
          message: 'This QR code has already been used and is no longer valid'
        });
      }
      
      if (qrDetails && qrDetails.scannedAt) {
        return res.status(400).json({
          success: false,
          message: 'This QR code has already been scanned and cannot be used again'
        });
      }
      
      // Validate request status
      if (request.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Home permission request is not approved'
        });
      }
      
      // Check time-based expiration
      if (qrDetails && qrDetails.validUntil && new Date() > new Date(qrDetails.validUntil)) {
        return res.status(400).json({
          success: false,
          message: 'QR code has expired'
        });
      }
      
      // Create gate activity entry for home permission
      const gateActivity = {
        type: scanType,
        scannedAt: new Date(),
        location: location,
        scannedBy: gateUserId,
        qrType: qrType
      };
      
      // Add gate activity to request
      if (!request.gateActivity) {
        request.gateActivity = [];
      }
      request.gateActivity.push(gateActivity);
      
      // ✅ IMPORTANT: Also create a separate GateActivity document for PDF reports
      const GateActivity = require('../models/GateActivity');
      try {
        const newGateActivity = new GateActivity({
          studentId: request.studentId._id,
          homePermissionRequestId: request._id,
          type: scanType.toLowerCase(), // 'in' or 'out'
          scannedAt: new Date(),
          location: location,
          qrCode: qrId,
          securityPersonnel: gateUserId,
          isEmergency: request.category === 'emergency',
          createdBy: gateUserId
        });
        
        await newGateActivity.save();
        console.log('✅ GateActivity document created:', newGateActivity._id);
      } catch (error) {
        console.error('❌ Failed to create GateActivity document:', error);
        // Don't fail the scan if GateActivity creation fails
      }
      
      // Mark QR as used and expired
      if (scanType === 'OUT' && request.qrCode.outgoing) {
        request.qrCode.outgoing.isExpired = true;
        request.qrCode.outgoing.scannedAt = new Date();
      } else if (scanType === 'IN' && request.qrCode.incoming) {
        request.qrCode.incoming.isExpired = true;
        request.qrCode.incoming.scannedAt = new Date();
      }
      
      await request.save();
      
      scanResult = {
        type: scanType,
        message: `Home permission ${scanType.toLowerCase()} scan successful`,
        student: {
          name: request.studentId.name,
          rollNumber: request.studentId.rollNumber,
          hostelBlock: request.studentId.hostelBlock,
          floor: request.studentId.floor,
          roomNumber: request.studentId.roomNumber
        },
        scannedAt: gateActivity.scannedAt,
        location: location,
        requestType: 'home-permission',
        category: request.category || 'normal',
        isEmergency: request.category === 'emergency',
        // Home permission specific data
        homePermission: {
          homeTownName: request.homeTownName,
          goingDate: request.goingDate,
          incomingDate: request.incomingDate,
          purpose: request.purpose,
          category: request.category || 'normal',
          status: request.status
        }
      };
    } else {
      // Original outing request scanning logic
      console.log('Attempting to scan outing QR:', { qrId, userId: gateUserId, location });
      scanResult = await request.scanQR(qrId, gateUserId, location);
    }
    
    console.log('Scan result:', scanResult);

    // Prepare response data based on request type
    const responseData = {
      ...scanResult,
      request: isHomePermission ? {
        id: request._id,
        purpose: request.purpose,
        goingDate: request.goingDate,
        incomingDate: request.incomingDate,
        homeTownName: request.homeTownName,
        category: request.category || 'normal',
        isEmergency: request.category === 'emergency',
        requestType: 'home-permission'
      } : {
        id: request._id,
        purpose: request.purpose,
        outingDate: request.outingDate,
        outingTime: request.outingTime,
        returnTime: request.returnTime,
        category: request.category || 'normal',
        isEmergency: request.category === 'emergency',
        requestType: 'outing'
      }
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('QR scan error:', error);
    console.error('QR scan error stack:', error.stack);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to scan QR code'
    });
  }
});

// Test route without authentication for debugging
router.post('/test-validate', (req, res) => {
  console.log('🧪 TEST VALIDATE endpoint hit!');
  res.json({ success: true, message: 'Test route working', path: req.path });
});

// Temporary debug route - check current user
router.get('/debug/current-user', auth, (req, res) => {
  console.log('👤 Current user debug:', req.user);
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      hasAccess: ['security', 'admin', 'warden'].includes(req.user.role?.toLowerCase())
    }
  });
});

// TEMPORARY: QR validation without strict auth for debugging
router.post('/qr/validate-debug', async (req, res) => {
  console.log('🧪 DEBUG QR Validate endpoint hit (no auth)!');
  console.log('Body:', req.body);
  
  try {
    let { qrData } = req.body;
    console.log('Debug - Received QR data:', qrData);

    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: 'QR data is required'
      });
    }

    // Handle string QR data
    if (typeof qrData === 'string') {
      try {
        qrData = JSON.parse(qrData);
      } catch {
        // If parsing fails, assume it's a simple QR ID
        qrData = { qrId: qrData };
      }
    }

    // Extract QR ID
    const qrId = qrData.qrId || qrData.id;
    if (!qrId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code format - missing ID'
      });
    }

    console.log('Debug - Looking for QR ID:', qrId);

    // Try OutingRequest first
    let request = await OutingRequest.findByQRId(qrId);
    let requestType = 'outing';
    console.log('OutingRequest.findByQRId result:', request ? 'FOUND' : 'NOT FOUND');

    // If not found, try HomePermissionRequest
    if (!request) {
      const HomePermissionRequest = require('../models/HomePermissionRequest');
      request = await HomePermissionRequest.findByQRId(qrId);
      requestType = request ? 'home-permission' : null;
      console.log('HomePermissionRequest.findByQRId result:', request ? 'FOUND' : 'NOT FOUND');
    }

    if (!request) {
      console.log('❌ No request found for QR ID:', qrId);
      return res.status(404).json({
        success: false,
        message: 'QR code not found or invalid'
      });
    }

    console.log('✅ Debug - Request found:', {
      id: request._id,
      hasStudentId: !!request.studentId,
      studentName: request.studentId?.name,
      status: request.status,
      requestType
    });

    // Determine if this is an outgoing or incoming QR
    const isOutgoing = qrId.includes('OUT') || (request.qrCode?.outgoing && request.qrCode.outgoing.qrId === qrId);
    const qrType = isOutgoing ? 'OUT' : 'IN';

    // Simple response for debugging
    res.json({
      success: true,
      data: {
        qrId,
        type: qrType,
        status: 'valid',
        requestType,
        student: {
          name: request.studentId?.name || 'Unknown',
          rollNumber: request.studentId?.rollNumber || 'Unknown'
        },
        canScan: true,
        message: 'Debug validation successful'
      }
    });

  } catch (error) {
    console.error('Debug QR validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate QR code',
      error: error.message
    });
  }
});



// Simple test endpoint to check scan functionality
router.post('/debug/test-scan', auth, checkRole(['security', 'admin', 'warden']), async (req, res) => {
  try {
    console.log('=== TEST SCAN DEBUG ===');
    console.log('Request body:', req.body);
    console.log('User:', req.user);
    
    // Test with a simple QR ID
    const testQrId = req.body.qrId || 'OUT_123456_789012';
    console.log('Testing with QR ID:', testQrId);
    
    // Find any existing request
    const request = await OutingRequest.findByQRId(testQrId);
    console.log('Request found:', request ? 'Yes' : 'No');
    
    if (request) {
      console.log('Request details:', {
        id: request._id,
        hasOutgoingQR: !!request.qrCode?.outgoing?.qrId,
        hasIncomingQR: !!request.qrCode?.incoming?.qrId,
        outgoingQRId: request.qrCode?.outgoing?.qrId,
        incomingQRId: request.qrCode?.incoming?.qrId
      });
    }
    
    res.json({
      success: true,
      data: {
        testQrId,
        requestFound: !!request,
        requestDetails: request ? {
          id: request._id,
          studentId: request.studentId,
          hasOutgoingQR: !!request.qrCode?.outgoing?.qrId,
          hasIncomingQR: !!request.qrCode?.incoming?.qrId
        } : null
      }
    });
    
  } catch (error) {
    console.error('Test scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Test scan failed',
      error: error.message
    });
  }
});

// Get system status and debug info
router.get('/debug/status', auth, checkRole(['security', 'admin', 'warden']), async (req, res) => {
  try {
    console.log('=== GATE DEBUG STATUS ===');
    
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
    // Count total requests with QR codes
    const totalRequests = await OutingRequest.countDocuments({
      $or: [
        { 'qrCode.outgoing.qrId': { $exists: true } },
        { 'qrCode.incoming.qrId': { $exists: true } }
      ]
    });
    
    // Get recent QR codes
    const recentQRs = await OutingRequest.find({
      $or: [
        { 'qrCode.outgoing.qrId': { $exists: true } },
        { 'qrCode.incoming.qrId': { $exists: true } }
      ]
    })
    .populate('studentId', 'name rollNumber')
    .sort({ createdAt: -1 })
    .limit(3);

    const qrSamples = [];
    recentQRs.forEach(request => {
      if (request.qrCode.outgoing?.qrId) {
        qrSamples.push({
          type: 'OUTGOING',
          qrId: request.qrCode.outgoing.qrId,
          student: request.studentId?.name,
          expired: request.qrCode.outgoing.isExpired,
          jsonData: request.qrCode.outgoing.data
        });
      }
      if (request.qrCode.incoming?.qrId) {
        qrSamples.push({
          type: 'INCOMING', 
          qrId: request.qrCode.incoming.qrId,
          student: request.studentId?.name,
          expired: request.qrCode.incoming.isExpired,
          jsonData: request.qrCode.incoming.data
        });
      }
    });

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        database: {
          status: dbStatus,
          totalQRCodes: totalRequests
        },
        qrSamples: qrSamples,
        endpoints: {
          validate: '/gate/qr/validate',
          scan: '/gate/scan',
          dashboard: '/gate/dashboard'
        },
        testInstructions: {
          manualInput: 'Copy a qrId from qrSamples and paste in dashboard input',
          jsonInput: 'Copy jsonData from qrSamples for full JSON testing',
          cameraRequirement: 'Camera requires HTTPS or localhost'
        }
      }
    });

  } catch (error) {
    console.error('Debug status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get debug status',
      error: error.message
    });
  }
});

// Create test QR code for testing
router.post('/debug/create-test-qr', auth, checkRole(['security', 'admin', 'warden']), async (req, res) => {
  try {
    // Find or create a test user
    let testUser = await User.findOne({ email: 'test.student@kietgroup.com' });
    if (!testUser) {
      testUser = new User({
        name: 'Test Student',
        email: 'test.student@kietgroup.com', 
        password: 'hashedpassword',
        role: 'student',
        rollNumber: 'TEST123',
        phoneNumber: '9876543210',
        parentPhoneNumber: '9876543211',
        hostelBlock: 'D-Block',
        floor: '2nd Floor',
        roomNumber: '201',
        branch: 'Computer Science',
        semester: 3
      });
      await testUser.save();
    }

    // Create a test outing request
    const testRequest = new OutingRequest({
      studentId: testUser._id,
      purpose: 'Testing QR Scanner',
      outingDate: new Date().toISOString().split('T')[0],
      outingTime: '10:00',
      returnTime: '18:00',
      status: 'approved',
      floorInchargeApproval: {
        status: 'approved',
        approvedBy: req.user.id,
        approvedAt: new Date()
      },
      hostelInchargeApproval: {
        status: 'approved', 
        approvedBy: req.user.id,
        approvedAt: new Date()
      }
    });

    await testRequest.save();
    
    // Generate outgoing QR
    await testRequest.generateOutgoingQR();
    
    res.json({
      success: true,
      data: {
        message: 'Test QR code created successfully',
        qrId: testRequest.qrCode.outgoing.qrId,
        qrData: testRequest.qrCode.outgoing.data,
        student: testUser.name,
        requestId: testRequest._id
      }
    });

  } catch (error) {
    console.error('Create test QR error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test QR code',
      error: error.message
    });
  }
});

// Debug route to check existing QR codes
router.get('/debug/qr-codes', auth, checkRole(['security', 'admin', 'warden']), async (req, res) => {
  try {
    const requests = await OutingRequest.find({
      $or: [
        { 'qrCode.outgoing.qrId': { $exists: true } },
        { 'qrCode.incoming.qrId': { $exists: true } }
      ]
    })
    .populate('studentId', 'name rollNumber')
    .limit(10)
    .sort({ createdAt: -1 });

    const qrCodes = [];
    requests.forEach(request => {
      if (request.qrCode.outgoing?.qrId) {
        qrCodes.push({
          qrId: request.qrCode.outgoing.qrId,
          type: 'OUTGOING',
          student: request.studentId?.name,
          requestId: request._id,
          isExpired: request.qrCode.outgoing.isExpired
        });
      }
      if (request.qrCode.incoming?.qrId) {
        qrCodes.push({
          qrId: request.qrCode.incoming.qrId,
          type: 'INCOMING',
          student: request.studentId?.name,
          requestId: request._id,
          isExpired: request.qrCode.incoming.isExpired
        });
      }
    });

    res.json({
      success: true,
      data: {
        totalRequests: requests.length,
        qrCodes: qrCodes
      }
    });

  } catch (error) {
    console.error('Debug QR codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch QR codes',
      error: error.message
    });
  }
});

// Get recent gate activity
router.get('/activity/recent', auth, checkRole(['security', 'admin', 'warden']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const recentActivity = await OutingRequest.find({
      'gateActivity.scannedAt': { $gte: startOfDay }
    })
    .populate('studentId', 'name rollNumber hostelBlock floor roomNumber')
    .sort({ 'gateActivity.scannedAt': -1 })
    .limit(limit);

    const activityLog = [];
    recentActivity.forEach(request => {
      request.gateActivity.forEach(activity => {
        if (activity.scannedAt >= startOfDay) {
          activityLog.push({
            id: `${request._id}_${activity._id}`,
            student: request.studentId,
            type: activity.type,
            scannedAt: activity.scannedAt,
            location: activity.location,
            purpose: request.purpose,
            remarks: activity.remarks
          });
        }
      });
    });

    activityLog.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));

    res.json({
      success: true,
      data: activityLog.slice(0, limit)
    });

  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity',
      error: error.message
    });
  }
});

// Generate Enhanced PDF of gate activity with block separation and in/out time tracking
router.get('/activity/pdf', auth, checkRole(['security', 'admin', 'warden', 'gate']), async (req, res) => {
  try {
    console.log('📄 Generating Enhanced Gate Activity PDF...');

    const { startDate, endDate } = req.query;
    
    // Use provided dates or default to today
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();
    
    if (!startDate && !endDate) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    console.log('📅 Date range:', { start, end });

    // Use the GateActivity model for comprehensive tracking
    const GateActivity = require('../models/GateActivity');
    
    // Get all gate activities within the date range
    const gateActivities = await GateActivity.getActivitiesByDateRange(start, end);
    
    console.log('🎯 Found gate activities:', gateActivities.length);

    // Enhanced activity log with proper in/out time tracking and request type separation
    const activityLog = [];
    const studentTimeTracker = new Map(); // Track in/out times for each student

    // Process gate activities
    gateActivities.forEach(activity => {
      const studentId = activity.studentId?._id?.toString();
      
      // Track student times
      if (studentId) {
        if (!studentTimeTracker.has(studentId)) {
          studentTimeTracker.set(studentId, { 
            outTime: null, 
            inTime: null, 
            activities: [],
            student: activity.studentId 
          });
        }
        
        const tracker = studentTimeTracker.get(studentId);
        if (activity.type === 'out') {
          tracker.outTime = activity.scannedAt;
        } else if (activity.type === 'in') {
          tracker.inTime = activity.scannedAt;
        }
        tracker.activities.push(activity);
      }

      // Determine request type and get purpose
      let requestType = 'outing';
      let purpose = 'General Outing';
      let isEmergency = activity.isEmergency || false;
      let category = 'regular';
      let status = 'approved';
      let approvalFlags = null;

      if (activity.homePermissionRequestId) {
        requestType = 'home-permission';
        purpose = activity.homePermissionRequestId?.purpose || 'Home Permission';
        isEmergency = activity.homePermissionRequestId?.isEmergency || activity.homePermissionRequestId?.category === 'emergency';
        category = activity.homePermissionRequestId?.category || 'regular';
        status = activity.homePermissionRequestId?.status || 'approved';
      } else if (activity.outingRequestId) {
        requestType = 'outing';
        purpose = activity.outingRequestId?.purpose || 'General Outing';
        isEmergency = activity.outingRequestId?.isEmergency || activity.outingRequestId?.category === 'emergency';
        category = activity.outingRequestId?.category || 'regular';
        status = activity.outingRequestId?.status || 'approved';
      }

      activityLog.push({
        id: activity._id.toString(),
        student: activity.studentId,
        type: activity.type.toUpperCase(),
        scannedAt: activity.scannedAt,
        location: activity.location || 'Main Gate',
        purpose: purpose,
        remarks: activity.securityComment || activity.suspiciousComment || '',
        qrType: 'QR',
        requestType: requestType,
        isEmergency: isEmergency,
        category: category,
        status: status,
        approvalFlags: approvalFlags,
        isSuspicious: activity.isSuspicious,
        securityPersonnel: activity.securityPersonnel
      });
    });

    // Sort by scan time (most recent first)
    activityLog.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));

    // Enhanced statistics calculation
    const stats = {
      studentsOut: 0,
      studentsIn: 0,
      currentlyOut: 0,
      pendingReturn: 0,
      totalActivities: activityLog.length,
      emergencyCount: activityLog.filter(a => a.isEmergency).length,
      homePermissions: activityLog.filter(a => a.requestType === 'home-permission').length,
      outings: activityLog.filter(a => a.requestType === 'outing').length
    };

    // Calculate current status by looking at the most recent activity for each student
    const studentStatus = new Map();
    
    activityLog.forEach(activity => {
      const studentId = activity.student?._id?.toString();
      if (studentId) {
        const currentActivity = studentStatus.get(studentId);
        if (!currentActivity || new Date(activity.scannedAt) > new Date(currentActivity.scannedAt)) {
          studentStatus.set(studentId, activity);
        }
      }
    });

    // Count based on most recent activity per student
    studentStatus.forEach(activity => {
      if (activity.type === 'OUT' || activity.type === 'OUTGOING') {
        stats.studentsOut++;
        stats.currentlyOut++;
      } else if (activity.type === 'IN' || activity.type === 'INCOMING') {
        stats.studentsIn++;
      }
    });

    stats.pendingReturn = Math.max(0, stats.currentlyOut);

    console.log('📊 Enhanced stats:', stats);

    const pdfContent = await generateGateActivityPDF({
      activityLog,
      stats,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      currentUser: req.user.email,
      studentTimeTracker
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=gate_activity_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.pdf`);
    res.send(pdfContent);

  } catch (error) {
    console.error('Enhanced PDF generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate enhanced PDF',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get suspicious students for hostel incharge
router.get('/suspicious-students/:hostelBlock?', auth, checkRole(['hostel-incharge', 'admin', 'warden']), async (req, res) => {
  try {
    const { hostelBlock } = req.params;
    const { timeRange = '7' } = req.query; // Default to last 7 days
    
    console.log('🚨 Fetching suspicious students:', { hostelBlock, timeRange, userRole: req.user.role });
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));
    
    console.log('📅 Date range for suspicious activities:', {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    });
    
    // Build match criteria
    const matchCriteria = {
      'gateActivity': {
        $elemMatch: {
          'isSuspicious': true,
          'scannedAt': {
            $gte: startDate,
            $lte: endDate
          }
        }
      }
    };
    
    // Add hostel block filter if specified
    if (hostelBlock) {
      matchCriteria.hostelBlock = hostelBlock;
    }
    
    // Find requests with suspicious gate activity
    const suspiciousRequests = await OutingRequest.find(matchCriteria)
      .populate({
        path: 'studentId',
        model: 'Student',
        select: 'name rollNumber hostelBlock floor roomNumber phoneNumber'
      })
      .sort({ 'gateActivity.scannedAt': -1 })
      .exec();
    
    console.log(`🎯 Found ${suspiciousRequests.length} requests with suspicious activity`);
    
    // Extract suspicious activities with student details
    const suspiciousActivities = [];
    
    suspiciousRequests.forEach(request => {
      if (request.gateActivity && request.gateActivity.length > 0) {
        request.gateActivity.forEach(activity => {
          if (activity.isSuspicious && 
              activity.scannedAt >= startDate && 
              activity.scannedAt <= endDate) {
            suspiciousActivities.push({
              id: `${request._id}_${activity._id}`,
              student: {
                _id: request.studentId._id,
                name: request.studentId.name,
                rollNumber: request.studentId.rollNumber,
                hostelBlock: request.studentId.hostelBlock,
                floor: request.studentId.floor,
                roomNumber: request.studentId.roomNumber,
                phoneNumber: request.studentId.phoneNumber
              },
              activity: {
                type: activity.type,
                scannedAt: activity.scannedAt,
                location: activity.location,
                suspiciousComment: activity.suspiciousComment,
                securityComment: activity.securityComment,
                remarks: activity.remarks
              },
              outing: {
                purpose: request.purpose,
                outingDate: request.outingDate,
                outingTime: request.outingTime,
                returnTime: request.returnTime
              }
            });
          }
        });
      }
    });
    
    // Sort by most recent first
    suspiciousActivities.sort((a, b) => new Date(b.activity.scannedAt) - new Date(a.activity.scannedAt));
    
    console.log(`📊 Processed ${suspiciousActivities.length} suspicious activities`);
    
    res.json({
      success: true,
      data: {
        suspiciousActivities,
        totalCount: suspiciousActivities.length,
        dateRange: {
          start: startDate,
          end: endDate,
          days: parseInt(timeRange)
        },
        hostelBlock: hostelBlock || 'all'
      }
    });
    
  } catch (error) {
    console.error('❌ Suspicious students fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch suspicious students data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;