const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

// Reports routes for Hostel Incharge
router.get('/download', auth, checkRole(['hostel-incharge']), reportController.generateReport);
router.get('/download-custom', auth, checkRole(['hostel-incharge']), reportController.generateCustomReport);
router.get('/student-specific', auth, checkRole(['hostel-incharge', 'warden']), reportController.generateStudentSpecificReport);
router.get('/gate-activity', auth, checkRole(['security', 'warden', 'admin']), reportController.generateGateActivityReport);

module.exports = router;