const OutingRequest = require('../models/OutingRequest');
const HomePermissionRequest = require('../models/HomePermissionRequest');
const { generateUnifiedOutingHomePDF } = require('../services/unifiedPdfService');

// GET /reports/unified?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
exports.generateUnifiedReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const baseDate = { createdAt: { $gte: start, $lte: end } };
    const blockFilter = (req.user.assignedBlocks && req.user.assignedBlocks.length)
      ? { hostelBlock: { $in: req.user.assignedBlocks } }
      : {};

    const [outings, homes] = await Promise.all([
      OutingRequest.find({ ...baseDate, ...blockFilter })
        .populate('studentId', 'name rollNumber hostelBlock roomNumber branch')
        .sort({ createdAt: -1 })
        .lean(),
      HomePermissionRequest.find({ ...baseDate, ...blockFilter })
        .populate('studentId', 'name rollNumber hostelBlock roomNumber branch')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const all = [...outings, ...homes];
    const approved = all.filter(r => r.status === 'approved').length;
    const pending = all.filter(r => r.status === 'pending').length;
    const denied = all.filter(r => r.status === 'denied').length;

    const getBlock = (r) => r.hostelBlock || r.studentId?.hostelBlock;
    const blockDistribution = {
      'D-Block': all.filter(r => getBlock(r) === 'D-Block').length,
      'E-Block': all.filter(r => getBlock(r) === 'E-Block').length,
      'Womens-Block': all.filter(r => getBlock(r) === 'Womens-Block').length,
      'D-Block_emg': all.filter(r => getBlock(r) === 'D-Block' && (r.isEmergency || r.category === 'emergency')).length,
      'E-Block_emg': all.filter(r => getBlock(r) === 'E-Block' && (r.isEmergency || r.category === 'emergency')).length,
      'Womens-Block_emg': all.filter(r => getBlock(r) === 'Womens-Block' && (r.isEmergency || r.category === 'emergency')).length,
    };

    const emergencyCount = all.filter(r => r.isEmergency || r.category === 'emergency').length;
    const homeCount = homes.length;
    const outingCount = outings.length;

    const pdf = await generateUnifiedOutingHomePDF({
      title: 'Custom Outing Report',
      period: { startDate: start.toLocaleDateString(), endDate: end.toLocaleDateString() },
      data: { outings, homePermissions: homes },
      stats: { total: all.length, approved, pending, denied, blockDistribution, emergencyCount, homeCount, outingCount }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=custom-outing-report-${Date.now()}.pdf`);
    res.send(pdf);
  } catch (error) {
    console.error('Unified report generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};