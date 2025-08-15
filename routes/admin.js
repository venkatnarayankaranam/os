const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { auth, checkRole } = require('../middleware/auth');
const User = require('../models/User');

// Change Floor Incharge Password
// PUT /api/admin/floorincharge/:id/password
router.put('/floorincharge/:id/password', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'newPassword is required and must be at least 6 characters' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Floor incharge not found' });
    }

    if (user.role !== 'floor-incharge') {
      return res.status(400).json({ success: false, message: 'Target user is not a floor incharge' });
    }

    // Ensure hostel-incharge can only change passwords for their assigned blocks
    const assignedBlocks = Array.isArray(req.user.assignedBlocks) ? req.user.assignedBlocks : [];
    if (!assignedBlocks.includes(user.hostelBlock)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to modify users outside your assigned blocks' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);

    user.password = hashed;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating floor incharge password:', error);
    res.status(500).json({ success: false, message: 'Failed to update password' });
  }
});

module.exports = router;