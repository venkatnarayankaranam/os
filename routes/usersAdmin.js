const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const User = require('../models/User');

// GET /api/admin/users/floor-incharges - list floor-incharge users for password management
router.get('/users/floor-incharges', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) ? req.user.assignedBlocks : (req.user.hostelBlock ? [req.user.hostelBlock] : []);
    const users = await User.find({ role: 'floor-incharge', hostelBlock: { $in: assignedBlocks } })
      .select('_id name email role hostelBlock floor');
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error listing floor incharges:', error);
    res.status(500).json({ success: false, message: 'Failed to load floor incharges' });
  }
});

module.exports = router;