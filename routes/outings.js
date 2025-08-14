const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const OutingRequest = require('../models/OutingRequest');
const User = require('../models/User');
const Student = require('../models/Student');
const { auth, checkRole } = require('../middleware/auth');
const socketIO = require('../config/socket');
const Notification = require('../models/Notification');
const workflowController = require('../controllers/outingWorkflowController');
const PDFDocument = require('pdfkit');
const { generatePDF } = require('../services/pdfService');
const QRCode = require('qrcode');
const { getIO } = require('../config/socket');
const { sendParentApprovalSMSForOuting, sendFloorInchargeApprovalSMS, sendCheckoutSMS, sendCheckinSMS } = require('../services/smsService');

// Get students under floor incharge
router.get('/floor-incharge/students/:email', auth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    
    const floorIncharge = await User.findOne({ email });
    if (!floorIncharge) {
      return res.status(404).json({
        success: false,
        message: 'Floor incharge not found',
      });
    }

    // Convert floor value to array if it's not already
    const floors = Array.isArray(floorIncharge.floor) 
      ? floorIncharge.floor 
      : floorIncharge.floor ? [floorIncharge.floor] : [];

    console.log('Floor incharge details:', {
      hostelBlock: floorIncharge.hostelBlock,
      floors: floors,
      email: floorIncharge.email
    });

    // Get all students under this floor incharge
    const students = await Student.find({
      hostelBlock: floorIncharge.hostelBlock,
      floor: { $in: floors }
    }).select('name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester')
      .sort({ floor: 1, roomNumber: 1 });

    console.log(`Found ${students.length} students for block ${floorIncharge.hostelBlock} and floors ${floors.join(', ')}`);

    res.json({
      success: true,
      students,
      totalStudents: students.length,
      debug: {
        floorInchargeDetails: {
          hostelBlock: floorIncharge.hostelBlock,
          floors: floors,
          email: floorIncharge.email
        }
      }
    });
  } catch (error) {
    console.error('Error in /floor-incharge/students/:email:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get all outing requests for floor incharge (not just pending)
router.get('/floor-incharge/requests', auth, checkRole(['floor-incharge']), async (req, res) => {
  try {
    // Prefer assignedBlock/assignedFloor if present, else fallback to hostelBlock/floor for legacy users
    const assignedBlock = req.user.assignedBlock || req.user.hostelBlock;
    const assignedFloorRaw = req.user.assignedFloor && req.user.assignedFloor.length > 0
      ? req.user.assignedFloor
      : (req.user.floor ? [req.user.floor] : []);
    
    console.log('Floor Incharge Request Query:', {
      user: req.user,
      assignedBlock,
      assignedFloor: assignedFloorRaw
    });

    if (!assignedBlock || !assignedFloorRaw || assignedFloorRaw.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Floor Incharge has no assigned block or floors',
        debug: { assignedBlock, assignedFloor: assignedFloorRaw }
      });
    }

    // Normalize possible floor representations
    const normalizeFloor = (f) => {
      if (!f) return f;
      const s = String(f);
      if (s === '1' || s === '1st' || s.includes('1st')) return '1st Floor';
      if (s === '2' || s === '2nd' || s.includes('2nd')) return '2nd Floor';
      if (s === '3' || s === '3rd' || s.includes('3rd')) return '3rd Floor';
      if (s === '4' || s === '4th' || s.includes('4th')) return '4th Floor';
      return s;
    };
    const floors = (Array.isArray(assignedFloorRaw) ? assignedFloorRaw : [assignedFloorRaw])
      .filter(Boolean)
      .map(normalizeFloor);

    // Expand block synonyms (W-Block <-> Womens-Block)
    const searchBlocks = (() => {
      if (!assignedBlock) return [];
      if (assignedBlock === 'W-Block') return ['W-Block', 'Womens-Block'];
      if (assignedBlock === 'Womens-Block') return ['Womens-Block', 'W-Block'];
      return [assignedBlock];
    })();

    const requests = await OutingRequest.find({
      hostelBlock: { $in: searchBlocks },
      floor: { $in: floors },
      status: 'pending',
      currentLevel: 'floor-incharge'
    }).populate({
      path: 'studentId',
      select: 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber'
    }).sort({ createdAt: -1 });

    console.log(`Found ${requests.length} requests for ${assignedBlock}, floors: ${floors.join(', ')}`);

    const stats = {
      totalStudents: await Student.countDocuments({
        hostelBlock: { $in: searchBlocks },
        floor: { $in: floors }
      }),
      pending: await OutingRequest.countDocuments({
        hostelBlock: { $in: searchBlocks },
        floor: { $in: floors },
        status: 'pending',
        currentLevel: 'floor-incharge'
      }),
      approved: await OutingRequest.countDocuments({
        hostelBlock: { $in: searchBlocks },
        floor: { $in: floors },
        status: 'approved'
      }),
      denied: await OutingRequest.countDocuments({
        hostelBlock: { $in: searchBlocks },
        floor: { $in: floors },
        status: 'denied'
      })
    };

    res.json({
      success: true,
      requests: requests.map(req => ({
        ...req.toObject(),
        studentName: req.studentId?.name,
        studentEmail: req.studentId?.email
      })),
      stats,
      debug: {
        searchedFloors: floors,
        hostelBlock: assignedBlock,
        foundRequests: requests.length
      }
    });

  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      debug: error.stack
    });
  }
});

// Get approved outing students
router.get('/floor-incharge/approved-students', auth, checkRole(['floor-incharge']), async (req, res) => {
  try {
    const { hostelBlock, assignedFloor } = req.user;
    const assignedFloorsRaw = Array.isArray(assignedFloor)
      ? assignedFloor
      : (assignedFloor ? [assignedFloor] : []);

    // If no floors assigned, return empty list gracefully
    if (!assignedFloorsRaw.length || !hostelBlock) {
      return res.json({ success: true, students: [] });
    }

    const normalizeFloor = (f) => {
      const s = String(f || '').toLowerCase();
      if (s === '1' || s.includes('1st')) return '1st Floor';
      if (s === '2' || s.includes('2nd')) return '2nd Floor';
      if (s === '3' || s.includes('3rd')) return '3rd Floor';
      if (s === '4' || s.includes('4th')) return '4th Floor';
      return f;
    };

    const floors = assignedFloorsRaw.map(normalizeFloor);

    // Support synonyms between W-Block and Womens-Block
    const blockVariants = hostelBlock === 'W-Block'
      ? ['W-Block', 'Womens-Block']
      : (hostelBlock === 'Womens-Block' ? ['Womens-Block', 'W-Block'] : [hostelBlock]);

    const approvedRequests = await OutingRequest.find({
      hostelBlock: { $in: blockVariants },
      floor: { $in: floors },
      status: 'approved'
    })
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester')
      .sort({ outingDate: -1 });

    // Filter out any requests where student population failed
    const validRequests = approvedRequests.filter(req => req.studentId);

    const uniqueStudents = Array.from(new Map(
      validRequests.map(request => [
        request.studentId._id.toString(),
        {
          ...request.studentId.toObject(),
          outTime: request.outingTime,
          inTime: request.returnTime,
          outingDate: request.outingDate
        }
      ])
    ).values());

    res.json({
      success: true,
      students: uniqueStudents
    });
  } catch (error) {
    console.error('Error fetching approved students:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get approved students for warden
router.get('/approved-students/warden', auth, checkRole(['warden']), async (req, res) => {
  try {
    console.log('🔍 Fetching approved students for warden...');
    
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
      ? req.user.assignedBlocks
      : (req.user.assignedBlock ? [req.user.assignedBlock] : (req.user.hostelBlock ? [req.user.hostelBlock] : []));

    const blockVariants = assignedBlocks.flatMap(b => (b === 'W-Block' ? ['W-Block', 'Womens-Block'] : (b === 'Womens-Block' ? ['Womens-Block', 'W-Block'] : [b])));
    
    const approvedRequests = await OutingRequest.find({
      status: 'approved',
      hostelBlock: { $in: blockVariants },
      'approvalFlags.warden.isApproved': true
    })
    .populate({
      path: 'studentId',
      model: 'Student',
      select: 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester'
    })
    .sort({ outingDate: -1 });

    console.log(`📊 Found ${approvedRequests.length} approved requests for warden in blocks: ${blockVariants.join(', ')}`);

    // Filter out requests where student population failed and map the data
    const validRequests = approvedRequests.filter(request => request.studentId);
    
    const uniqueStudents = Array.from(new Map(
      validRequests.map(request => {
        try {
          return [
            request.studentId._id.toString(),
            {
              ...request.studentId.toObject(),
              outingTime: request.outingTime,
              returnTime: request.returnTime,
              outingDate: request.outingDate,
              requestId: request._id
            }
          ];
        } catch (err) {
          console.error('Error processing student data:', err);
          return null;
        }
      }).filter(item => item !== null)
    ).values());

    console.log(`✅ Returning ${uniqueStudents.length} unique students to warden`);

    res.json({
      success: true,
      students: uniqueStudents
    });
  } catch (error) {
    console.error('❌ Error fetching warden approved students:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get approved students for hostel incharge
router.get('/approved-students/hostel-incharge', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const { assignedBlocks } = req.user;
    console.log('🔍 Fetching approved students for hostel-incharge, blocks:', assignedBlocks);

    const approvedRequests = await OutingRequest.find({
      hostelBlock: { $in: assignedBlocks },
      status: 'approved',
      'approvalFlags.hostelIncharge.isApproved': true
    })
    .populate({
      path: 'studentId',
      model: 'Student',
      select: 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester'
    })
    .sort({ outingDate: -1 });

    console.log(`📊 Found ${approvedRequests.length} approved requests for hostel-incharge`);

    // Filter out requests where student population failed and map the data
    const validRequests = approvedRequests.filter(request => request.studentId);

    const uniqueStudents = Array.from(new Map(
      validRequests.map(request => {
        try {
          return [
            request.studentId._id.toString(),
            {
              ...request.studentId.toObject(),
              outingTime: request.outingTime,
              returnTime: request.returnTime,
              outingDate: request.outingDate,
              requestId: request._id
            }
          ];
        } catch (err) {
          console.error('Error processing student data:', err);
          return null;
        }
      }).filter(item => item !== null)
    ).values());

    console.log(`✅ Returning ${uniqueStudents.length} unique students to hostel-incharge`);

    res.json({
      success: true,
      students: uniqueStudents
    });
  } catch (error) {
    console.error('❌ Error fetching hostel incharge approved students:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Handle request actions (approve/deny)
router.patch('/floor-incharge/request/:requestId/:action', auth, checkRole(['floor-incharge']), async (req, res) => {
  try {
    const { requestId, action } = req.params;
    const { comments = '' } = req.body;
    
    console.log('Processing floor-incharge request:', {
      requestId,
      action,
      userDetails: req.user
    });

    // Validate action
    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    const request = await OutingRequest.findById(requestId)
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Validate request state
    if (request.status !== 'pending' || request.currentLevel !== 'floor-incharge') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request state for approval',
        currentStatus: request.status,
        currentLevel: request.currentLevel
      });
    }

    // Update approval state
    request.approvalFlags.floorIncharge = {
      isApproved: action === 'approve',
      timestamp: new Date(),
      remarks: comments
    };

    // Add to approval flow with proper level mapping
    request.approvalFlow.push({
      level: '1', // Use numeric level to match the pre-save middleware logic
      status: action === 'approve' ? 'approved' : 'denied',
      timestamp: new Date(),
      remarks: comments,
      approvedBy: req.user.email,
      approverInfo: {
        email: req.user.email,
        role: 'floor-incharge'
      }
    });

    // Explicitly mark approvalFlow as modified to ensure pre-save middleware is triggered
    request.markModified('approvalFlow');

    console.log('📝 Adding outing approval to flow:', {
      requestId: request._id,
      approvalEntry: {
        level: '1',
        status: action === 'approve' ? 'approved' : 'denied',
        timestamp: new Date(),
        remarks: comments,
        approvedBy: req.user.email,
        approverInfo: {
          email: req.user.email,
          role: 'floor-incharge'
        }
      },
      currentLevel: request.currentLevel,
      status: request.status
    });

    if (action === 'approve') {
      // Let the pre-save middleware handle the level transition
      // request.moveToNextLevel(); // Remove this line to let pre-save handle it
    } else {
      request.status = 'denied';
      request.currentLevel = 'completed';
    }

    const savedRequest = await request.save();

    console.log('💾 Outing request saved after approval:', {
      requestId: savedRequest._id,
      currentLevel: savedRequest.currentLevel,
      status: savedRequest.status,
      approvalFlags: savedRequest.approvalFlags
    });

    // Emit socket event
    const io = req.app.get('socketio');
    if (io) {
      io.emit('request-update', {
        type: 'status-change',
        request: savedRequest
      });
    }

    // Create notification for student on FI decision
    try {
      await Notification.create({
        userId: request.studentId._id,
        title: action === 'approve' ? 'Outing Request Moved to Hostel Incharge' : 'Outing Request Denied',
        message: action === 'approve' ? 'Your outing request was approved by Floor Incharge.' : 'Your outing request was denied by Floor Incharge.',
        type: 'outingUpdate',
        referenceId: request._id
      });
    } catch (e) {}

    // Send SMS to parent when floor incharge approves
    if (action === 'approve') {
      try {
        const smsResult = await sendFloorInchargeApprovalSMS(request, 'outing');
        if (smsResult?.error) {
          console.warn('Floor incharge approval SMS failed:', smsResult.error);
        } else if (smsResult?.success) {
          console.log('Floor incharge approval SMS sent successfully');
        }
      } catch (smsError) {
        console.error('Error sending floor incharge approval SMS:', smsError.message);
      }
    }

    res.json({
      success: true,
      message: `Request ${action}d successfully`,
      request: {
        id: savedRequest._id,
        status: savedRequest.status,
        currentLevel: savedRequest.currentLevel
      }
    });

  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error.message
    });
  }
});

// Create new outing request (for students)
router.post('/requests/submit', auth, checkRole(['student']), async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Validate required fields
    const { outingDate, outTime, returnTime, purpose, parentContact, category = 'normal' } = req.body;
    
    if (!outingDate || !outTime || !returnTime || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        required: ['outingDate', 'outTime', 'returnTime', 'purpose']
      });
    }

    // Check if student has any active outing requests (pending or approved)
    const activeRequest = await OutingRequest.findOne({
      studentId: req.user.id,
      status: { $in: ['pending', 'approved'] },
      currentLevel: { $ne: 'completed' }
    });

    if (activeRequest) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active outing request. Please complete or cancel your current request before creating a new one.'
      });
    }

    try {
      const normalizeBlock = (block) => {
        if (!block) return block;
        const b = String(block).trim();
        const lower = b.toLowerCase();
        if (['w-block', 'women-block', 'womens-block', 'women block', 'womens block', 'girls-block', 'girls block', 'w'].includes(lower)) {
          return 'Womens-Block';
        }
        if (lower.startsWith('d')) return 'D-Block';
        if (lower.startsWith('e')) return 'E-Block';
        return b.includes('-Block') ? b : `${b}-Block`;
      };

      const normalizeFloor = (f) => {
        if (!f) return '1st Floor';
        const s = String(f);
        if (s === '1' || s.includes('1st')) return '1st Floor';
        if (s === '2' || s.includes('2nd')) return '2nd Floor';
        if (s === '3' || s.includes('3rd')) return '3rd Floor';
        if (s === '4' || s.includes('4th')) return '4th Floor';
        return s;
      };

      const newRequest = new OutingRequest({
        studentId: student._id,
        outingDate: new Date(outingDate),
        outingTime: outTime,
        returnTime: returnTime,
        purpose: purpose,
        category: category,
        parentPhoneNumber: parentContact || student.parentPhoneNumber,
        hostelBlock: normalizeBlock(student.hostelBlock),
        floor: normalizeFloor(student.floor)
      });

      await newRequest.save();

      res.status(201).json({
        success: true,
        request: {
          id: newRequest._id,
          outingDate: newRequest.outingDate,
          outingTime: newRequest.outingTime,
          returnTime: newRequest.returnTime,
          status: newRequest.status,
          currentLevel: newRequest.currentLevel
        }
      });
    } catch (saveError) {
      console.error('Error saving request:', saveError);
      throw new Error(`Failed to save request: ${saveError.message}`);
    }

  } catch (error) {
    console.error('Request submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit outing request',
      error: error.message
    });
  }
});

// Handle approval at any level
router.post('/:requestId/approve', auth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { approvalFlow } = req.body;

    // First fetch the request
    const outingRequest = await OutingRequest.findById(requestId);
    if (!outingRequest) {
      return res.status(404).json({
        success: false,
        message: 'Request not found',
        requestId
      });
    }

    // Allow approval if request is either pending OR at hostel-incharge level
    if (outingRequest.status !== 'pending' && outingRequest.currentLevel !== 'hostel-incharge') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve this request',
        currentStatus: outingRequest.status,
        currentLevel: outingRequest.currentLevel
      });
    }

    // Get current approval
    const currentApproval = approvalFlow[0];
    
    try {
      // Check approval content
      const validationErrors = [];
      if (!currentApproval.approvedBy) validationErrors.push('approvedBy is required');
      if (!currentApproval.approverInfo?.email) validationErrors.push('approver email is required');
      if (currentApproval.approverInfo?.role !== 'HostelIncharge') {
        validationErrors.push('approverInfo.role must be exactly "HostelIncharge"');
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(', '));
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval data',
        details: {
          error: error.message,
          received: currentApproval
        }
      });
    }

    // Add approval to flow
    outingRequest.approvalFlow.push({
      ...currentApproval,
      level: 'hostel-incharge', // Explicitly set the level for hostel incharge approval
      timestamp: new Date(),
      status: 'approved'
    });

    // Update request status and approval flags
    outingRequest.approvalFlags.hostelIncharge.isApproved = true;
    outingRequest.approvalFlags.hostelIncharge.timestamp = new Date();
    outingRequest.approvalFlags.hostelIncharge.remarks = currentApproval.remarks || '';
    outingRequest.currentLevel = 'warden';
    outingRequest.lastModifiedBy = currentApproval.approverInfo.email;

    // If emergency, mark as approved/completed and generate QR
    if (outingRequest.category === 'emergency') {
      outingRequest.status = 'approved';
      outingRequest.currentLevel = 'completed';
    }

    // Save the request first
    await outingRequest.save();

    // Generate QR code for emergency outing after saving
    if (outingRequest.category === 'emergency') {
      try {
        await outingRequest.generateOutgoingQR();
        // Save again to persist the QR code
        await outingRequest.save();
      } catch (qrError) {
        console.error('Error generating QR for emergency outing:', qrError);
      }
    }

    res.json({
      success: true,
      message: 'Request approved successfully',
      request: {
        id: outingRequest._id,
        status: outingRequest.status,
        currentLevel: outingRequest.currentLevel,
        approvalFlow: outingRequest.approvalFlow
      }
    });

  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process approval',
      details: error.message
    });
  }
});

// Get requests by approval level
router.get('/pending/:level', auth, checkRole(['floor-incharge', 'hostel-incharge', 'warden']), async (req, res) => {
  try {
    const { level } = req.params;
    
    // Build query based on user role
    let query = { currentLevel: level };
    
    if (req.user.role === 'warden') {
      // For wardens, use assignedBlocks
      const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
        ? req.user.assignedBlocks
        : [];
      
      if (assignedBlocks.length > 0) {
        query.hostelBlock = { $in: assignedBlocks };
      }
    } else if (req.user.role === 'floor-incharge') {
      // For floor incharge, use assignedBlock and assignedFloor
      query.hostelBlock = req.user.assignedBlock || req.user.hostelBlock;
      if (req.user.assignedFloor) {
        query.floor = { $in: req.user.assignedFloor };
      }
    } else if (req.user.role === 'hostel-incharge') {
      // For hostel incharge, use assignedBlocks
      const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
        ? req.user.assignedBlocks
        : [];
      
      if (assignedBlocks.length > 0) {
        query.hostelBlock = { $in: assignedBlocks };
      }
    }
    
    const requests = await OutingRequest.find(query)
      .populate('studentId', 'name email rollNumber phoneNumber hostelBlock roomNumber')
      .populate('approvalFlow.approvedBy', 'name email role');

    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// QR code verification endpoint
router.post('/verify-qr', auth, checkRole(['security']), async (req, res) => {
  try {
    const { qrData } = req.body;
    const decodedData = JSON.parse(qrData);
    
    const request = await OutingRequest.findById(decodedData.requestId)
      .populate('studentId', 'name rollNumber phoneNumber parentPhoneNumber branch roomNumber');

    if (!request || request.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or unauthorized QR code'
      });
    }

    // Check if student is checking in or out
    const isCheckingIn = request.tracking.checkOut && !request.tracking.checkIn;
    
    if (isCheckingIn) {
      request.tracking.checkIn = {
        time: new Date(),
        verifiedBy: req.user.id
      };
    } else if (!request.tracking.checkOut) {
      request.tracking.checkOut = {
        time: new Date(),
        verifiedBy: req.user.id
      };
    } else {
      return res.status(400).json({
        success: false,
        message: 'Student has already completed the outing cycle'
      });
    }

    await request.save();

    res.json({
      success: true,
      message: `Student ${isCheckingIn ? 'checked in' : 'checked out'} successfully`,
      outingDetails: {
        name: request.studentId.name,
        rollNumber: request.studentId.rollNumber,
        phoneNumber: request.studentId.phoneNumber,
        parentPhoneNumber: request.studentId.parentPhoneNumber,
        branch: request.studentId.branch,
        roomNumber: request.studentId.roomNumber,
        outingTime: request.outingTime,
        inTime: request.returnTime,
        status: request.status,
        tracking: request.tracking
      }
    });
  } catch (error) {
    console.error('QR verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get outing request details
router.get('/:id/details', auth, checkRole(['hostel-incharge', 'floor-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const request = await OutingRequest.findById(req.params.id)
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch semester')
      .lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Outing request not found'
      });
    }

    // Check if user has access to this request
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
      ? req.user.assignedBlocks
      : (req.user.hostelBlock ? [req.user.hostelBlock] : []);

    if (!assignedBlocks.includes(request.hostelBlock) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Request not in your assigned blocks'
      });
    }

    res.json({
      success: true,
      data: {
        ...request,
        studentId: request.studentId._id
      }
    });
  } catch (error) {
    console.error('Get outing request details error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch outing request details',
      error: error.message 
    });
  }
});

// Get QR Code for student
router.get('/request/:id/qr-code', auth, async (req, res) => {
  try {
    const request = await OutingRequest.findOne({
      _id: req.params.id,
      studentId: req.user.id,
      status: 'approved'
    });

    if (!request || !request.qrCode) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found or request not approved'
      });
    }

    res.json({
      success: true,
      qrCode: request.qrCode.data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get hostel incharge dashboard data
router.get('/dashboard/hostel-incharge', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const { assignedBlocks } = req.user;
    
    // Get requests that are at hostel-incharge level (including emergency requests)
    const requests = await OutingRequest.find({
      hostelBlock: { $in: assignedBlocks },
      currentLevel: 'hostel-incharge'
    })
    .populate('studentId', 'name email rollNumber phoneNumber hostelBlock floor roomNumber branch semester')
    .lean() // Convert to plain JavaScript object
    .exec();

    // Transform requests to include approval status and category
    const transformedRequests = requests.map(request => ({
      id: request._id,
      studentName: request.studentId?.name,
      rollNumber: request.studentId?.rollNumber,
      hostelBlock: request.studentId?.hostelBlock,
      floor: request.studentId?.floor,
      roomNumber: request.studentId?.roomNumber,
      branch: request.studentId?.branch,
      semester: request.studentId?.semester,
      outingDate: request.outingDate,
      outingTime: request.outingTime,
      returnTime: request.returnTime,
      purpose: request.purpose,
      status: request.status,
      currentLevel: request.currentLevel,
      category: request.category, // Include category for emergency badge
      floorInchargeApproval: request.approvalFlags?.floorIncharge?.isApproved ? 'approved' : 'pending',
      hostelInchargeApproval: request.approvalFlags?.hostelIncharge?.isApproved ? 'approved' : 'pending',
      wardenApproval: request.approvalFlags?.warden?.isApproved ? 'approved' : 'pending',
      approvalFlow: request.approvalFlow,
      parentPhoneNumber: request.parentPhoneNumber,
      createdAt: request.createdAt
    }));

    const stats = {
      pending: await OutingRequest.countDocuments({
        hostelBlock: { $in: assignedBlocks },
        currentLevel: 'hostel-incharge',
        status: 'pending'
      }),
      approved: await OutingRequest.countDocuments({
        hostelBlock: { $in: assignedBlocks },
        'approvalFlags.hostelIncharge.isApproved': true
      }),
      denied: await OutingRequest.countDocuments({
        hostelBlock: { $in: assignedBlocks },
        status: 'denied'
      }),
      awaitingApproval: await OutingRequest.countDocuments({
        hostelBlock: { $in: assignedBlocks },
        'approvalFlags.floorIncharge.isApproved': true,
        'approvalFlags.hostelIncharge.isApproved': false,
        currentLevel: 'hostel-incharge'
      }),
      pendingFloorIncharge: await OutingRequest.countDocuments({
        hostelBlock: { $in: assignedBlocks },
        'approvalFlags.floorIncharge.isApproved': false,
        currentLevel: 'floor-incharge'
      }),
      emergency: await OutingRequest.countDocuments({
        hostelBlock: { $in: assignedBlocks },
        category: 'emergency',
        currentLevel: 'hostel-incharge'
      })
    };

    res.json({
      success: true,
      data: { 
        requests: transformedRequests,
        stats 
      }
    });
  } catch (error) {
    console.error('Error fetching hostel incharge dashboard:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update the warden dashboard endpoint
router.get('/dashboard/warden', auth, checkRole(['warden']), async (req, res) => {
  try {
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
      ? req.user.assignedBlocks
      : (req.user.assignedBlock ? [req.user.assignedBlock] : (req.user.hostelBlock ? [req.user.hostelBlock] : []));

    const blockVariants = assignedBlocks.flatMap(b => (b === 'W-Block' ? ['W-Block', 'Womens-Block'] : (b === 'Womens-Block' ? ['Womens-Block', 'W-Block'] : [b])));

    const [pendingRequests, stats] = await Promise.all([
      OutingRequest.find({
        currentLevel: 'warden',
        hostelBlock: { $in: blockVariants },
        'approvalFlags.hostelIncharge.isApproved': true,
        'approvalFlags.warden.isApproved': false
      }).populate('studentId', 'name email rollNumber phoneNumber hostelBlock floor roomNumber parentPhoneNumber'),

      {
        pending: await OutingRequest.countDocuments({
          currentLevel: 'warden',
          hostelBlock: { $in: blockVariants },
          'approvalFlags.hostelIncharge.isApproved': true,
          'approvalFlags.warden.isApproved': false
        }),
        approved: await OutingRequest.countDocuments({
          hostelBlock: { $in: blockVariants },
          'approvalFlags.warden.isApproved': true
        }),
        denied: await OutingRequest.countDocuments({
          hostelBlock: { $in: blockVariants },
          status: 'denied',
          currentLevel: 'completed'
        })
      }
    ]);

    // Get additional stats
    const [totalHostels, totalStudents, outingsToday] = await Promise.all([
      // Only count hostel blocks that this warden is assigned to
      assignedBlocks.length,
      Student.countDocuments({ hostelBlock: { $in: blockVariants } }),
      OutingRequest.countDocuments({
        hostelBlock: { $in: blockVariants },
        outingDate: {
          $gte: new Date().setHours(0, 0, 0, 0),
          $lt: new Date().setHours(23, 59, 59, 999)
        }
      })
    ]);

    // Calculate approval rate
    const approvalRate = stats.approved > 0 
      ? Math.round((stats.approved / (stats.approved + stats.denied)) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        requests: pendingRequests,
        totalHostels,
        totalStudents,
        outingsToday,
        approvalRate,
        stats
      }
    });
  } catch (error) {
    console.error('Warden dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update warden approve endpoint
router.patch('/warden/approve/:requestId', auth, checkRole(['warden']), async (req, res) => {
  try {
    const request = await OutingRequest.findById(req.params.requestId)
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check current status
    if (request.approvalFlags?.warden?.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'Request is already approved'
      });
    }

    // Update approval status using approvalFlags
    if (!request.approvalFlags) {
      request.approvalFlags = {
        floorIncharge: { isApproved: false },
        hostelIncharge: { isApproved: false },
        warden: { isApproved: false }
      };
    }

    // Update warden approval
    request.approvalFlags.warden = {
      isApproved: true,
      approvedBy: req.user.email,
      approvedAt: new Date(),
      timestamp: new Date(), // Add timestamp for QR generation
      remarks: req.body.comments || 'Approved by Warden'
    };

    // Update main status fields
    request.status = 'approved';
    request.currentLevel = 'completed';

    // Generate outgoing QR code with student details before saving
    try {
      console.log('🔧 Starting QR generation for request:', request._id);
      console.log('🔧 Student data:', {
        id: request.studentId?._id,
        name: request.studentId?.name,
        rollNumber: request.studentId?.rollNumber
      });
      
      await request.generateOutgoingQR();
      console.log(`✅ Outgoing QR generated for student: ${request.studentId?.name || 'Unknown'}`);
    } catch (error) {
      console.error('❌ Outgoing QR Code generation error:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      // Continue even if QR generation fails - don't break the approval process
    }

    // Save once after all changes
    await request.save();

    // Create notification for student
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        userId: request.studentId._id,
        title: 'Outing Request Approved',
        message: 'Your outing request has been approved by the Warden. QR code has been generated successfully.',
        type: 'outingUpdate',
        referenceId: request._id,
        read: false
      });
      await notification.save();

      // Emit real-time notification if socket is available
      const socketIO = require('../config/socket');
      if (socketIO.getIO()) {
        socketIO.getIO().to(request.studentId._id.toString()).emit('notification', {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: 'outingUpdate',
          createdAt: notification.createdAt
        });
      }
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the approval process if notification fails
    }

    // Attempt to send SMS to parent upon final approval
    try {
      // Ensure student is populated for composing message
      if (!request.studentId?.name) {
        await request.populate('studentId', 'name rollNumber parentPhoneNumber');
      }
      const smsResult = await sendParentApprovalSMSForOuting(request);
      if (smsResult?.error) {
        console.warn('Parent SMS send failed:', smsResult.error);
      } else if (smsResult?.success) {
        console.log('Final approval SMS sent successfully');
      }
    } catch (smsError) {
      console.error('Error sending parent SMS:', smsError.message);
    }

    // Emit socket event if needed
    const io = req.app.get('io');
    if (io) {
      io.emit('request-approved', {
        requestId: request._id,
        status: request.status,
        level: 'warden'
      });
    }

    res.json({
      success: true,
      message: 'Request approved successfully',
      request: {
        id: request._id,
        status: request.status,
        studentName: request.studentId.name,
        currentLevel: request.currentLevel
      }
    });

  } catch (error) {
    console.error('Warden approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve request',
      error: error.message
    });
  }
});

// Warden deny endpoint
router.post('/warden/deny/:requestId', auth, checkRole(['warden']), async (req, res) => {
  try {
    const request = await OutingRequest.findById(req.params.requestId)
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check current status
    if (request.status === 'denied') {
      return res.status(400).json({
        success: false,
        message: 'Request is already denied'
      });
    }

    // Update denial status using approvalFlags
    if (!request.approvalFlags) {
      request.approvalFlags = {
        floorIncharge: { isApproved: false },
        hostelIncharge: { isApproved: false },
        warden: { isApproved: false }
      };
    }

    // Update warden denial
    request.approvalFlags.warden = {
      isApproved: false,
      approvedBy: req.user.email,
      approvedAt: new Date(),
      remarks: req.body.comments || 'Denied by Warden'
    };

    // Update main status fields
    request.status = 'denied';
    request.currentLevel = 'completed';

    await request.save();

    // Emit socket event if needed
    const io = req.app.get('io');
    if (io) {
      io.emit('warden-request-updated', {
        requestId: request._id,
        status: request.status,
        level: 'warden'
      });
    }

    res.json({
      success: true,
      message: 'Request denied successfully',
      request: {
        id: request._id,
        status: request.status,
        studentName: request.studentId.name,
        currentLevel: request.currentLevel
      }
    });

  } catch (error) {
    console.error('Warden denial error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deny request',
      error: error.message
    });
  }
});

// Floor Incharge deny endpoint
router.post('/floor-incharge/deny/:requestId', auth, checkRole(['floor-incharge']), async (req, res) => {
  try {
    const request = await OutingRequest.findById(req.params.requestId)
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check current status
    if (request.status === 'denied') {
      return res.status(400).json({
        success: false,
        message: 'Request is already denied'
      });
    }

    // Update denial status using approvalFlags
    if (!request.approvalFlags) {
      request.approvalFlags = {
        floorIncharge: { isApproved: false },
        hostelIncharge: { isApproved: false },
        warden: { isApproved: false }
      };
    }

    // Update floor incharge denial
    request.approvalFlags.floorIncharge = {
      isApproved: false,
      approvedBy: req.user.email,
      approvedAt: new Date(),
      remarks: req.body.comments || 'Denied by Floor Incharge'
    };

    // Update main status fields
    request.status = 'denied';
    request.currentLevel = 'completed';

    await request.save();

    // Emit socket event if needed
    const io = req.app.get('io');
    if (io) {
      io.emit('floor-incharge-request-updated', {
        requestId: request._id,
        status: request.status,
        level: 'floor-incharge'
      });
    }

    res.json({
      success: true,
      message: 'Request denied successfully',
      request: {
        id: request._id,
        status: request.status,
        studentName: request.studentId.name,
        currentLevel: request.currentLevel
      }
    });

  } catch (error) {
    console.error('Floor Incharge denial error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deny request',
      error: error.message
    });
  }
});

// Hostel Incharge deny endpoint
router.post('/hostel-incharge/deny/:requestId', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const request = await OutingRequest.findById(req.params.requestId)
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check current status
    if (request.status === 'denied') {
      return res.status(400).json({
        success: false,
        message: 'Request is already denied'
      });
    }

    // Update denial status using approvalFlags
    if (!request.approvalFlags) {
      request.approvalFlags = {
        floorIncharge: { isApproved: false },
        hostelIncharge: { isApproved: false },
        warden: { isApproved: false }
      };
    }

    // Update hostel incharge denial
    request.approvalFlags.hostelIncharge = {
      isApproved: false,
      approvedBy: req.user.email,
      approvedAt: new Date(),
      remarks: req.body.comments || 'Denied by Hostel Incharge'
    };

    // Update main status fields
    request.status = 'denied';
    request.currentLevel = 'completed';

    await request.save();

    // Emit socket event if needed
    const io = req.app.get('io');
    if (io) {
      io.emit('hostel-incharge-request-updated', {
        requestId: request._id,
        status: request.status,
        level: 'hostel-incharge'
      });
    }

    res.json({
      success: true,
      message: 'Request denied successfully',
      request: {
        id: request._id,
        status: request.status,
        studentName: request.studentId.name,
        currentLevel: request.currentLevel
      }
    });

  } catch (error) {
    console.error('Hostel Incharge denial error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deny request',
      error: error.message
    });
  }
});

// Hostel incharge request actions (approve/deny) - similar to floor incharge
router.patch('/hostel-incharge/request/:requestId/:action', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const { requestId, action } = req.params;
    const { comments = '' } = req.body;
    
    console.log('Processing hostel-incharge request:', {
      requestId,
      action,
      userDetails: req.user
    });

    // Validate action
    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    const request = await OutingRequest.findById(requestId)
      .populate('studentId', 'name email rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Validate request state - hostel incharge can approve/deny if status is pending and currentLevel is hostel-incharge
    if (request.status !== 'pending' || request.currentLevel !== 'hostel-incharge') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request state for approval',
        currentStatus: request.status,
        currentLevel: request.currentLevel
      });
    }

    // Update approval state
    request.approvalFlags.hostelIncharge = {
      isApproved: action === 'approve',
      timestamp: new Date(),
      remarks: comments
    };

    // Add to approval flow
    request.approvalFlow.push({
      level: 'hostel-incharge',
      status: action === 'approve' ? 'approved' : 'denied',
      timestamp: new Date(),
      remarks: comments,
      approvedBy: req.user.email,
      approverInfo: {
        email: req.user.email,
        role: 'hostel-incharge'
      }
    });

    if (action === 'approve') {
      // For emergency requests, mark as completed immediately
      if (request.category === 'emergency') {
        request.status = 'approved';
        request.currentLevel = 'completed';
        
        // Generate QR code for emergency outing after approval
        try {
          await request.generateOutgoingQR();
        } catch (qrError) {
          console.error('Error generating QR for emergency outing:', qrError);
        }
      } else {
        // For normal requests, move to next level (warden)
        request.currentLevel = 'warden';
      }
    } else {
      // Deny the request
      request.status = 'denied';
      request.currentLevel = 'completed';
    }

    const savedRequest = await request.save();

    // Emit socket event
    const io = req.app.get('socketio');
    if (io) {
      io.emit('request-update', {
        type: 'status-change',
        request: savedRequest
      });
    }

    // If this became final approval (emergency shortcut), notify parent via SMS
    try {
      if (savedRequest.status === 'approved' && savedRequest.currentLevel === 'completed') {
        if (!savedRequest.studentId?.name) {
          await savedRequest.populate('studentId', 'name rollNumber parentPhoneNumber');
        }
        const smsResult = await sendParentApprovalSMSForOuting(savedRequest);
        if (smsResult?.error) {
          console.warn('Parent SMS send failed (HI emergency):', smsResult.error);
        } else if (smsResult?.success) {
          console.log('Emergency approval SMS sent successfully');
        }
      }
    } catch (smsError) {
      console.error('Error sending parent SMS (HI emergency):', smsError.message);
    }

    res.json({
      success: true,
      message: `Request ${action}d successfully`,
      request: {
        id: savedRequest._id,
        status: savedRequest.status,
        currentLevel: savedRequest.currentLevel
      }
    });

  } catch (error) {
    console.error('Hostel incharge approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error.message
    });
  }
});

// Add new routes for workflow
router.post('/:requestId/approve', 
  auth, 
  checkRole(['floor-incharge', 'hostel-incharge', 'warden']), 
  workflowController.handleApproval
);

router.get('/dashboard/:role', 
  auth, 
  checkRole(['floor-incharge', 'hostel-incharge', 'warden']), 
  workflowController.getDashboardData
);

router.post('/verify-qr',
  auth,
  checkRole(['security']),
  workflowController.verifyQRCode
);

// Update the PDF generation endpoint
router.get('/approved-requests/pdf', auth, checkRole(['floor-incharge', 'hostel-incharge', 'warden']), async (req, res) => {
  try {
    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=approved-requests.pdf');

    // Get role-specific title and data
    const titles = {
      'floor-incharge': 'Floor Incharge Report - Approved Outing Requests',
      'hostel-incharge': 'Hostel Incharge Report - Approved Outing Requests',
      'warden': 'Warden Report - Approved Outing Requests'
    };

    // Get requests based on role with proper logging
    console.log('🔍 PDF Report Request:', {
      role: req.user.role,
      userEmail: req.user.email,
      assignedBlocks: req.user.assignedBlocks,
      assignedBlock: req.user.assignedBlock,
      assignedFloor: req.user.assignedFloor
    });

    let query = {};
    
    if (req.user.role === 'hostel-incharge') {
      // Hostel incharge can see all approved requests from D-Block, E-Block, Womens-Block
      query = {
        status: 'approved',
        hostelBlock: { $in: ['D-Block', 'E-Block', 'Womens-Block'] }
      };
    } else if (req.user.role === 'floor-incharge') {
      query = {
        status: 'approved',
        hostelBlock: req.user.assignedBlock,
        floor: { $in: req.user.assignedFloor }
      };
    } else if (req.user.role === 'warden') {
      // Warden can only see approved requests from their assigned blocks
      const assignedBlocks = Array.isArray(req.user.assignedBlocks) && req.user.assignedBlocks.length > 0
        ? req.user.assignedBlocks
        : (req.user.assignedBlock ? [req.user.assignedBlock] : (req.user.hostelBlock ? [req.user.hostelBlock] : []));
      
      if (assignedBlocks.length > 0) {
        query = {
          status: 'approved',
          hostelBlock: { $in: assignedBlocks }
        };
      } else {
        query = { status: 'approved' };
      }
    } else {
      // Default case - can see all approved requests
      query = { status: 'approved' };
    }

    console.log('📊 PDF Query:', query);

    const requests = await OutingRequest.find(query)
      .populate('studentId', 'name rollNumber hostelBlock floor roomNumber phoneNumber parentPhoneNumber branch')
      .sort({ createdAt: -1 });

    console.log('📋 Found Requests for PDF:', {
      count: requests.length,
      sampleRequest: requests[0] ? {
        id: requests[0]._id,
        studentName: requests[0].studentId?.name,
        status: requests[0].status,
        hostelBlock: requests[0].hostelBlock
      } : 'No requests found'
    });

    // Generate statistics for the report
    const statistics = {
      totalRequests: requests.length,
      approvedCount: requests.filter(r => r.status === 'approved').length,
      byBlock: {
        'D-Block': requests.filter(r => r.hostelBlock === 'D-Block').length,
        'E-Block': requests.filter(r => r.hostelBlock === 'E-Block').length,
        'Womens-Block': requests.filter(r => r.hostelBlock === 'Womens-Block').length
      },
      byDateRange: {
        thisWeek: requests.filter(r => {
          const reqDate = new Date(r.outingDate);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return reqDate >= weekAgo;
        }).length,
        thisMonth: requests.filter(r => {
          const reqDate = new Date(r.outingDate);
          const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          return reqDate >= monthAgo;
        }).length
      }
    };

    console.log('📈 PDF Report Statistics:', statistics);

    // Generate PDF with enhanced data
    generatePDF(res, {
      title: titles[req.user.role],
      requests,
      role: req.user.role,
      statistics,
      dateRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        end: new Date()
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
});

// Update approval routes
router.patch('/floor-incharge/request/:id/approve', auth, async (req, res) => {
  try {
    const outing = await OutingRequest.findById(req.params.id);
    if (!outing) return res.status(404).json({ success: false, message: 'Request not found' });

    // Verify current stage
    if (outing.status !== 'pending_floor_incharge') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request stage'
      });
    }

    // Update approval
    outing.approvals.floorIncharge = {
      approved: true,
      approvedAt: new Date(),
      approvedBy: req.user.id
    };
    
    // Update status
    outing.updateApprovalStatus();
    await outing.save();

    // Create notification for student
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        userId: outing.studentId,
        title: 'Outing Request Updated',
        message: 'Your outing request has been approved by the Hostel Incharge and forwarded to the Warden.',
        type: 'outingUpdate',
        referenceId: outing._id,
        read: false
      });
      await notification.save();

      // Emit real-time notification if socket is available
      const socketIO = require('../config/socket');
      if (socketIO.getIO()) {
        socketIO.getIO().to(outing.studentId.toString()).emit('notification', {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: 'outingUpdate',
          createdAt: notification.createdAt
        });
      }
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the approval process if notification fails
    }

    // Emit socket events
    const io = getIO();
    io.of('/floor-incharge').emit('request-updated', { 
      outingId: outing._id, 
      status: outing.status,
      approvalStage: outing.approvalStage
    });
    io.of('/hostel-incharge').emit('new-request', outing);

    res.json({ 
      success: true, 
      message: 'Request approved and forwarded to Hostel Incharge',
      status: outing.status
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/hostel-incharge/request/:id/approve', auth, async (req, res) => {
  try {
    const outing = await OutingRequest.findById(req.params.id);
    if (!outing) return res.status(404).json({ success: false, message: 'Request not found' });

    // Verify current stage
    if (outing.status !== 'pending_hostel_incharge') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request stage'
      });
    }

    // Update approval
    outing.approvals.hostelIncharge = {
      approved: true,
      approvedAt: new Date(),
      approvedBy: req.user.id
    };
    
    // Update status
    outing.updateApprovalStatus();
    await outing.save();

    // Create notification for student
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        userId: outing.studentId,
        title: 'Outing Request Updated',
        message: 'Your outing request has been approved by the Hostel Incharge and forwarded to the Warden.',
        type: 'outingUpdate',
        referenceId: outing._id,
        read: false
      });
      await notification.save();

      // Emit real-time notification if socket is available
      const socketIO = require('../config/socket');
      if (socketIO.getIO()) {
        socketIO.getIO().to(outing.studentId.toString()).emit('notification', {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: 'outingUpdate',
          createdAt: notification.createdAt
        });
      }
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the approval process if notification fails
    }

    // Emit socket events
    const io = getIO();
    io.of('/hostel-incharge').emit('request-updated', { 
      outingId: outing._id, 
      status: outing.status,
      approvalStage: outing.approvalStage
    });
    io.of('/warden').emit('new-request', outing);

    res.json({ 
      success: true, 
      message: 'Request approved and forwarded to Warden',
      status: outing.status
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/warden/request/:id/approve', auth, async (req, res) => {
  try {
    const outing = await OutingRequest.findById(req.params.id);
    if (!outing) return res.status(404).json({ success: false, message: 'Request not found' });

    // Verify current stage
    if (outing.status !== 'pending_warden') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request stage'
      });
    }

    // Update approval
    outing.approvals.warden = {
      approved: true,
      approvedAt: new Date(),
      approvedBy: req.user.id
    };
    
    // Update status and generate QR code only on final approval
    outing.updateApprovalStatus();
    
    if (outing.status === 'approved') {
      const qrData = {
        name: outing.studentId.name,
        rollNumber: outing.studentId.rollNumber,
        phoneNumber: outing.studentId.phoneNumber,
        parentPhoneNumber: outing.studentId.parentPhoneNumber,
        outTime: outing.outingTime,
        inTime: outing.returnTime,
        approvedAt: new Date()
      };

      outing.qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
    }

    await outing.save();

    // Create notification for student
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        userId: outing.studentId,
        title: 'Outing Request Updated',
        message: 'Your outing request has been approved by the Hostel Incharge and forwarded to the Warden.',
        type: 'outingUpdate',
        referenceId: outing._id,
        read: false
      });
      await notification.save();

      // Emit real-time notification if socket is available
      const socketIO = require('../config/socket');
      if (socketIO.getIO()) {
        socketIO.getIO().to(outing.studentId.toString()).emit('notification', {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: 'outingUpdate',
          createdAt: notification.createdAt
        });
      }
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the approval process if notification fails
    }

    // Emit socket events
    const io = getIO();
    io.of('/warden').emit('request-updated', { 
      outingId: outing._id, 
      status: outing.status,
      approvalStage: outing.approvalStage
    });
    
    if (outing.status === 'approved') {
      io.emit('request-approved', outing);
    }

    res.json({ 
      success: true, 
      message: outing.status === 'approved' ? 'Request fully approved' : 'Request updated',
      status: outing.status,
      qrCode: outing.qrCode
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all approved outings for gate security
router.get('/approved-outings', auth, checkRole(['security']), async (req, res) => {
  try {
    const approvedOutings = await OutingRequest.find({
      status: 'approved',
      'approvals.warden.approved': true
    }).populate('studentId', 'name rollNumber phoneNumber parentPhoneNumber hostelBlock roomNumber')
      .sort({ outingDate: -1 });

    const transformedOutings = approvedOutings.map(outing => ({
      id: outing._id,
      studentName: outing.studentId?.name || 'N/A',
      rollNumber: outing.studentId?.rollNumber || 'N/A',
      roomNumber: outing.studentId?.roomNumber || 'N/A',
      phoneNumber: outing.studentId?.phoneNumber || 'N/A',
      parentPhoneNumber: outing.studentId?.parentPhoneNumber || 'N/A',
      outingTime: outing.outingTime,
      returnTime: outing.returnTime,
      checkIn: outing.tracking?.checkIn,
      checkOut: outing.tracking?.checkOut,
      verificationStatus: !outing.tracking?.checkOut ? 'not_started' :
        !outing.tracking?.checkIn ? 'checked_out' : 'completed'
    }));

    // Get statistics
    const stats = {
      checkedIn: await OutingRequest.countDocuments({
        status: 'approved',
        'tracking.checkIn': { $exists: true }
      }),
      checkedOut: await OutingRequest.countDocuments({
        status: 'approved',
        'tracking.checkOut': { $exists: true },
        'tracking.checkIn': { $exists: false }
      }),
      pending: await OutingRequest.countDocuments({
        status: 'approved',
        'tracking.checkOut': { $exists: false }
      })
    };

    res.json({
      success: true,
      outings: transformedOutings,
      stats
    });
  } catch (error) {
    console.error('Error fetching approved outings:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// Add route for gate security check-in/check-out
router.post('/gate/scan', auth, checkRole(['security']), async (req, res) => {
  try {
    const { qrData, scanType } = req.body;
    const data = JSON.parse(qrData);
    
    const request = await OutingRequest.findById(data.requestId)
      .populate('studentId', 'name email rollNumber phoneNumber hostelBlock roomNumber parentPhoneNumber');

    if (!request || request.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or unauthorized QR code'
      });
    }

    const now = new Date();

    if (scanType === 'checkout') {
      if (request.tracking?.checkOut) {
        return res.status(400).json({
          success: false,
          message: 'Student has already checked out'
        });
      }

      request.tracking = {
        ...request.tracking,
        checkOut: {
          time: now,
          verifiedBy: req.user.id
        }
      };
    } else if (scanType === 'checkin') {
      if (!request.tracking?.checkOut) {
        return res.status(400).json({
          success: false,
          message: 'Student must check out first'
        });
      }

      if (request.tracking?.checkIn) {
        return res.status(400).json({
          success: false,
          message: 'Student has already checked in'
        });
      }

      request.tracking.checkIn = {
        time: now,
        verifiedBy: req.user.id
      };

      // Check if student is returning late
      const scheduledReturn = new Date(`${request.returnDate}T${request.returnTime}`);
      const timeDiff = Math.abs(now.getTime() - scheduledReturn.getTime()) / (1000 * 60); // diff in minutes
      
      if (timeDiff > 30) {
        request.status = 'late-return';
      }
    }

    await request.save();

    // Emit socket event
    socketIO.getIO().emit('gate-scan', {
      requestId: request._id,
      type: scanType,
      studentName: request.studentId.name,
      rollNumber: request.studentId.rollNumber,
      timestamp: now
    });

    res.json({
      success: true,
      message: `Successfully ${scanType === 'checkout' ? 'checked out' : 'checked in'} student`,
      studentDetails: {
        name: request.studentId.name,
        rollNumber: request.studentId.rollNumber,
        hostelBlock: request.studentId.hostelBlock,
        roomNumber: request.studentId.roomNumber,
        phoneNumber: request.studentId.phoneNumber,
        parentPhoneNumber: request.studentId.parentPhoneNumber,
        outTime: request.outingTime,
        returnTime: request.returnTime
      },
      tracking: request.tracking
    });

  } catch (error) {
    console.error('Gate scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process gate scan',
      error: error.message
    });
  }
});

router.get('/gate/active-outings', auth, checkRole(['security']), async (req, res) => {
  try {
    const outings = await OutingRequest.find({
      status: 'approved',
      'tracking.checkIn': { $exists: false },
      outingDate: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    }).populate('studentId', 'name rollNumber hostelBlock roomNumber phoneNumber parentPhoneNumber')
      .sort({ outingTime: 1 });

    const stats = {
      checkedOut: await OutingRequest.countDocuments({
        'tracking.checkOut': { $exists: true },
        'tracking.checkIn': { $exists: false }
      }),
      checkedIn: await OutingRequest.countDocuments({
        'tracking.checkOut': { $exists: true },
        'tracking.checkIn': { $exists: true },
        outingDate: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }),
      pendingReturns: await OutingRequest.countDocuments({
        status: 'approved',
        'tracking.checkOut': { $exists: true },
        'tracking.checkIn': { $exists: false },
        returnDate: { $lt: new Date() }
      })
    };

    res.json({
      success: true,
      outings: outings.map(o => ({
        id: o._id,
        studentName: o.studentId.name,
        rollNumber: o.studentId.rollNumber,
        roomNumber: o.studentId.roomNumber,
        hostelBlock: o.studentId.hostelBlock,
        outingTime: o.outingTime,
        returnTime: o.returnTime,
        phoneNumber: o.studentId.phoneNumber,
        parentPhoneNumber: o.studentId.parentPhoneNumber,
        tracking: o.tracking
      })),
      stats
    });

  } catch (error) {
    console.error('Error fetching active outings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active outings',
      error: error.message
    });
  }
});

// Get all approved outings for gate security
router.get('/gate/approved-outings', auth, checkRole(['security', 'gate']), async (req, res) => {
  try {
    console.log('Fetching approved outings. User role:', req.user.role);

    const approvedOutings = await OutingRequest.find({
      status: 'approved',
      currentLevel: 'completed',
      wardenApproval: 'approved',
      hostelInchargeApproval: 'approved',
      floorInchargeApproval: 'approved'
    })
    .populate('studentId', 'name rollNumber hostelBlock roomNumber phoneNumber parentPhoneNumber')
    .sort({ outingDate: -1 });

    const transformedOutings = approvedOutings.map(outing => ({
      id: outing._id,
      studentName: outing.studentId?.name || 'N/A',
      rollNumber: outing.studentId?.rollNumber || 'N/A',
      hostelBlock: outing.studentId?.hostelBlock || 'N/A',
      roomNumber: outing.studentId?.roomNumber || 'N/A',
      phoneNumber: outing.studentId?.phoneNumber || 'N/A',
      parentPhoneNumber: outing.studentId?.parentPhoneNumber || 'N/A',
      outingDate: outing.outingDate,
      outingTime: outing.outingTime,
      returnTime: outing.returnTime,
      purpose: outing.purpose,
      tracking: outing.tracking || {},
      approvalFlow: outing.approvalFlow || [],
      verificationStatus: !outing.tracking?.checkOut ? 'not_started' :
        !outing.tracking?.checkIn ? 'checked_out' : 'completed'
    }));

    const stats = {
      checkedIn: await OutingRequest.countDocuments({
        status: 'approved',
        'tracking.checkIn': { $exists: true }
      }),
      checkedOut: await OutingRequest.countDocuments({
        status: 'approved',
        'tracking.checkOut': { $exists: true },
        'tracking.checkIn': { $exists: false }
      }),
      pending: await OutingRequest.countDocuments({
        status: 'approved',
        'tracking.checkOut': { $exists: false }
      })
    };

    res.json({
      success: true,
      outings: transformedOutings,
      stats
    });
  } catch (error) {
    console.error('Error fetching approved outings:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;