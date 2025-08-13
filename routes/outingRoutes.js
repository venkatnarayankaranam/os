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
    const request = await OutingRequest.findById(requestId);
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    request.status = action;
    request.floorInchargeApproval = action;
    request.approvalTimestamps.floorIncharge = new Date();
    
    await request.save();

    res.json({ success: true, request });
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
