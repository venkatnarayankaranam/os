const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const unified = require('../controllers/unifiedReportController');

// Warden and Hostel Incharge can download unified report
router.get('/unified', auth, checkRole(['warden', 'hostel-incharge']), unified.generateUnifiedReport);

module.exports = router;