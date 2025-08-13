const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const DisciplinaryAction = require('../models/DisciplinaryAction');
const Student = require('../models/Student');
const Notification = require('../models/Notification');

// Create manual disciplinary action (hostel-incharge)
router.post('/', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const { studentId, title, description, severity = 'low' } = req.body;
    if (!studentId || !title) {
      return res.status(400).json({ success: false, message: 'studentId and title are required' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const action = await DisciplinaryAction.create({
      studentId,
      createdBy: req.user.id,
      createdByRole: req.user.role,
      source: 'manual',
      category: 'discipline',
      title,
      description: description || '',
      severity,
    });

    // Notify student
    try {
      await Notification.create({
        userId: student._id,
        title: 'Disciplinary Action Added',
        message: `${title}${severity ? ` (${severity})` : ''}`,
        type: 'disciplinary',
        referenceId: action._id,
      });
    } catch (e) {
      // best effort: do not block
    }

    res.json({ success: true, data: action });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get disciplinary actions for a student (student can view own, staff can view by id)
router.get('/student/:studentId?', auth, checkRole(['student', 'hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    let targetStudentId = req.params.studentId;
    if (req.user.role === 'student') {
      targetStudentId = req.user._id || req.user.id;
    }
    if (!targetStudentId) {
      return res.status(400).json({ success: false, message: 'studentId required' });
    }
    const actions = await DisciplinaryAction.find({ studentId: targetStudentId }).sort({ createdAt: -1 });
    res.json({ success: true, data: actions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update status (close/open) or details
router.patch('/:id', auth, checkRole(['hostel-incharge', 'warden', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body, updatedAt: new Date() };
    const updated = await DisciplinaryAction.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Action not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;


