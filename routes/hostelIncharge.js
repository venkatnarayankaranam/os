const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const Student = require('../models/Student');

// Promote students or mark as graduated
// PUT /api/hostelincharge/students/promote
router.put('/students/promote', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const { studentIds, targetYear } = req.body || {};

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds must be a non-empty array' });
    }

    const allowedYears = ['2nd', '3rd', '4th', 'Graduated'];
    if (!allowedYears.includes(targetYear)) {
      return res.status(400).json({ success: false, message: 'Invalid targetYear' });
    }

    let semesterUpdate = null;
    if (targetYear === '2nd') semesterUpdate = 3; // default start of year
    if (targetYear === '3rd') semesterUpdate = 5;
    if (targetYear === '4th') semesterUpdate = 7;

    const update = targetYear === 'Graduated'
      ? { status: 'Graduated' }
      : { year: targetYear.replace('nd','').replace('rd','').replace('th','') + 'st' ? targetYear : targetYear, semester: semesterUpdate };

    // For clarity, set year exactly to '2nd'/'3rd'/'4th'
    if (targetYear !== 'Graduated') {
      update.year = targetYear;
      if (semesterUpdate !== null) update.semester = semesterUpdate;
      update.status = 'Active';
    }

    const result = await Student.updateMany({ _id: { $in: studentIds } }, { $set: update });

    res.json({ success: true, message: 'Students updated successfully', modifiedCount: result.modifiedCount, update });
  } catch (error) {
    console.error('Error promoting students:', error);
    res.status(500).json({ success: false, message: 'Failed to update students' });
  }
});

// Get passed out (graduated) students
// GET /api/hostelincharge/students/passedout
router.get('/students/passedout', auth, checkRole(['hostel-incharge']), async (req, res) => {
  try {
    const students = await Student.find({ status: 'Graduated' })
      .select('name email rollNumber hostelBlock floor roomNumber branch semester year status');
    res.json({ success: true, students });
  } catch (error) {
    console.error('Error fetching passed out students:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch passed out students' });
  }
});

module.exports = router;