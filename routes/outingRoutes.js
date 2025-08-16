const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const OutingRequest = require('../models/OutingRequest');
const User = require('../models/User');

// Get floor incharge pending requests and stats
router.get('/floor-incharge/requests', auth, async (req, res) => {
  try {
    console.log('User details:', req.user); // Debug log

    const requests = await OutingRequest.find({
      hostelBlock: req.user.assignedBlock, // Match with user model field
      floor: req.user.assignedFloor // Match with user model field
    }).populate('studentId', 'name email rollNumber hostelBlock roomNumber');

    const stats = {
      totalStudents: await User.countDocuments({
        role: 'student',
        hostelBlock: req.user.assignedBlock,
        floor: req.user.assignedFloor,
      }),
      pending: await OutingRequest.countDocuments({
        hostelBlock: req.user.assignedBlock,
        floor: req.user.assignedFloor,
        status: 'pending'
      }),
      approved: await OutingRequest.countDocuments({
        hostelBlock: req.user.assignedBlock,
        floor: req.user.assignedFloor,
        status: 'approved'
      }),
      denied: await OutingRequest.countDocuments({
        hostelBlock: req.user.assignedBlock,
        floor: req.user.assignedFloor,
        status: 'denied'
      })
    };

    res.json({ 
      success: true, 
      requests,
      stats 
    });
  } catch (error) {
    console.error('Error in floor-incharge/requests:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Handle floor incharge actions (approve/deny)
router.patch('/floor-incharge/request/:requestId/:action', auth, checkRole(['floor-incharge']), async (req, res) => {
  try {
    const { requestId, action } = req.params;
    console.log('🔄 Floor Incharge action:', { requestId, action, user: req.user.email });
    
    const request = await OutingRequest.findById(requestId);
    
    if (!request) {
      console.log('❌ Request not found:', requestId);
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    console.log('📋 Request before update:', {
      id: request._id,
      status: request.status,
      currentLevel: request.currentLevel,
      approvalFlags: request.approvalFlags
    });

    request.status = action;
    
    // Update approval flags
    if (!request.approvalFlags) {
      request.approvalFlags = {
        floorIncharge: { isApproved: false },
        hostelIncharge: { isApproved: false },
        warden: { isApproved: false }
      };
    }
    
    request.approvalFlags.floorIncharge = {
      isApproved: action === 'approved',
      timestamp: new Date(),
      remarks: req.body.comments || `${action === 'approved' ? 'Approved' : 'Denied'} by Floor Incharge`
    };
    
    console.log('📝 Request after update:', {
      id: request._id,
      status: request.status,
      approvalFlags: request.approvalFlags
    });
    
    await request.save();

    // Emit socket event for real-time updates
    try {
      const { getIO } = require('../config/socket');
      const io = getIO();
      if (io) {
        io.of('/floor-incharge').emit('floor-incharge-request-updated', {
          requestId: request._id,
          status: request.status,
          action: action,
          timestamp: new Date()
        });
        
        // Also emit a general outing update event
        io.of('/floor-incharge').emit('outing-request-updated', {
          requestId: request._id,
          status: request.status,
          action: action,
          timestamp: new Date()
        });
        
        console.log('📡 Socket events emitted for request:', request._id);
      } else {
        console.log('⚠️ Socket IO not available');
      }
    } catch (socketError) {
      console.error('Socket emission error:', socketError);
      // Don't fail the request if socket fails
    }

    console.log('✅ Request updated successfully:', {
      id: request._id,
      status: request.status,
      action: action
    });

    res.json({ success: true, request });
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
