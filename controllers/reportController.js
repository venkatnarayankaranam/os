const PDFDocument = require('pdfkit');
const OutingRequest = require('../models/OutingRequest');
const { generatePDF } = require('../services/pdfService');

exports.generateReport = async (req, res) => {
  try {
    const { role, hostelBlock, assignedFloor } = req.user;
    const { reportType, status } = req.query; // reportType: daily, weekly, monthly, yearly

    // Calculate date ranges based on report type
    const now = new Date();
    let startDate, endDate;
    
    switch (reportType) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        startDate = weekStart;
        endDate = new Date();
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid report type. Use: daily, weekly, monthly, yearly'
        });
    }

    let query = {
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Add role-specific filters
    switch(role) {
      case 'floor-incharge':
        query.hostelBlock = hostelBlock;
        query.floor = { $in: assignedFloor };
        break;
      case 'hostel-incharge':
        query.hostelBlock = hostelBlock;
        break;
      case 'warden':
        // Warden can see all requests
        break;
    }

    if (status) {
      query.status = status;
    }

    const [requests, statistics] = await Promise.all([
      OutingRequest.find(query)
        .populate('studentId', 'name rollNumber hostelBlock roomNumber phoneNumber branch')
        .sort({ createdAt: -1 }),
      
      // Get statistics
      OutingRequest.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalOutings: { $sum: 1 },
            totalReturns: {
              $sum: {
                $cond: [{ $ne: ['$checkIn.time', null] }, 1, 0]
              }
            },
            approvedCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'approved'] }, 1, 0]
              }
            },
            pendingCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
              }
            },
            deniedCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'denied'] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const stats = statistics[0] || {
      totalOutings: 0,
      totalReturns: 0,
      approvedCount: 0,
      pendingCount: 0,
      deniedCount: 0
    };

    // Generate enhanced statistics for the report
    const enhancedStats = {
      totalRequests: requests.length,
      approvedCount: stats.approvedCount,
      pendingCount: stats.pendingCount,
      deniedCount: stats.deniedCount,
      byBlock: {
        'D-Block': requests.filter(r => r.hostelBlock === 'D-Block').length,
        'E-Block': requests.filter(r => r.hostelBlock === 'E-Block').length,
        'Womens-Block': requests.filter(r => r.hostelBlock === 'Womens-Block').length
      },
      byDateRange: {
        thisWeek: requests.filter(r => {
          const reqDate = new Date(r.createdAt);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return reqDate >= weekAgo;
        }).length,
        thisMonth: requests.filter(r => {
          const reqDate = new Date(r.createdAt);
          const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          return reqDate >= monthAgo;
        }).length
      }
    };

    // Generate PDF using the service
    const reportTitle = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Outing Report`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}-outing-report-${Date.now()}.pdf`);

    // Enhanced PDF generation with statistics
    generatePDF(res, {
      title: reportTitle,
      requests,
      role,
      statistics: enhancedStats,
      dateRange: {
        start: startDate,
        end: endDate
      }
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateCustomReport = async (req, res) => {
  try {
    const { assignedBlocks } = req.user;
    const { startDate, endDate, status, studentId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include the entire end date

    let query = {
      createdAt: {
        $gte: start,
        $lte: end
      }
    };

    // Filter by assigned blocks
    if (assignedBlocks && assignedBlocks.length > 0) {
      query.hostelBlock = { $in: assignedBlocks };
    }

    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by specific student if provided
    if (studentId && studentId !== 'all') {
      query.studentId = studentId;
    }

    const [requests, statistics] = await Promise.all([
      OutingRequest.find(query)
        .populate('studentId', 'name rollNumber hostelBlock roomNumber phoneNumber branch floor')
        .sort({ createdAt: -1 }),
      
      // Get enhanced statistics
      OutingRequest.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            approvedCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'approved'] }, 1, 0]
              }
            },
            pendingCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
              }
            },
            deniedCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'denied'] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const stats = statistics[0] || {
      totalRequests: 0,
      approvedCount: 0,
      pendingCount: 0,
      deniedCount: 0
    };

    // Enhanced statistics with block distribution
    const enhancedStats = {
      ...stats,
      byBlock: {
        'D-Block': requests.filter(r => r.hostelBlock === 'D-Block').length,
        'E-Block': requests.filter(r => r.hostelBlock === 'E-Block').length,
        'Womens-Block': requests.filter(r => r.hostelBlock === 'Womens-Block').length
      },
      dateRange: {
        start: start.toLocaleDateString(),
        end: end.toLocaleDateString()
      }
    };

    // If filtering by specific student, add student-specific stats
    if (studentId && studentId !== 'all') {
      const studentRequests = requests.filter(r => r.studentId._id.toString() === studentId);
      enhancedStats.studentSpecific = {
        totalOutings: studentRequests.length,
        approved: studentRequests.filter(r => r.status === 'approved').length,
        pending: studentRequests.filter(r => r.status === 'pending').length,
        denied: studentRequests.filter(r => r.status === 'denied').length,
        studentName: studentRequests[0]?.studentId?.name || 'Unknown',
        rollNumber: studentRequests[0]?.studentId?.rollNumber || 'Unknown'
      };
    }

    // Generate report title
    let reportTitle = 'Custom Outing Report';
    if (studentId && studentId !== 'all') {
      const studentName = requests[0]?.studentId?.name || 'Student';
      reportTitle = `Outing Report - ${studentName}`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=custom-outing-report-${Date.now()}.pdf`);

    // Generate PDF using the enhanced service
    generatePDF(res, {
      title: reportTitle,
      requests,
      role: req.user.role,
      statistics: enhancedStats,
      dateRange: {
        start,
        end
      },
      isCustomReport: true
    });

  } catch (error) {
    console.error('Custom report generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateStudentSpecificReport = async (req, res) => {
  try {
    const { assignedBlocks } = req.user;
    const { startDate, endDate, studentId, reportType } = req.query;

    if (!startDate || !endDate || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Start date, end date, and student ID are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get student details first
    const Student = require('../models/Student');
    const student = await Student.findById(studentId)
      .select('name rollNumber hostelBlock floor roomNumber branch semester')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check access permissions
    if (assignedBlocks && assignedBlocks.length > 0 && !assignedBlocks.includes(student.hostelBlock)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Student not in your assigned blocks'
      });
    }

    let requests = [];
    let reportTitle = '';
    
    if (reportType === 'home') {
      // Get home permission requests
      const HomePermissionRequest = require('../models/HomePermissionRequest');
      requests = await HomePermissionRequest.find({
        studentId: studentId,
        createdAt: {
          $gte: start,
          $lte: end
        }
      })
      .populate('studentId', 'name rollNumber hostelBlock floor roomNumber branch')
      .sort({ createdAt: -1 })
      .lean();

      reportTitle = `Home Permission Report - ${student.name}`;
    } else {
      // Get outing requests (default)
      requests = await OutingRequest.find({
        studentId: studentId,
        createdAt: {
          $gte: start,
          $lte: end
        }
      })
      .populate('studentId', 'name rollNumber hostelBlock floor roomNumber branch')
      .sort({ createdAt: -1 })
      .lean();

      reportTitle = `Outing Report - ${student.name}`;
    }

    // Get disciplinary actions and suspicious activities
    const DisciplinaryAction = require('../models/DisciplinaryAction');
    const Notification = require('../models/Notification');

    const [disciplinaryActions, suspiciousActivities] = await Promise.all([
      DisciplinaryAction.find({
        studentId: studentId,
        createdAt: {
          $gte: start,
          $lte: end
        }
      })
      .select('title description severity category createdAt')
      .sort({ createdAt: -1 })
      .lean(),

      Notification.find({
        userId: studentId,
        type: 'securityAlert',
        createdAt: {
          $gte: start,
          $lte: end
        }
      })
      .select('title message createdAt')
      .sort({ createdAt: -1 })
      .lean()
    ]);

    // Enhanced statistics
    const statistics = {
      totalRequests: requests.length,
      approvedCount: requests.filter(r => r.status === 'approved').length,
      pendingCount: requests.filter(r => r.status === 'pending').length,
      deniedCount: requests.filter(r => r.status === 'denied').length,
      emergencyCount: requests.filter(r => r.isEmergency || r.category === 'emergency').length,
      studentSpecific: {
        studentName: student.name,
        rollNumber: student.rollNumber,
        hostelBlock: student.hostelBlock,
        totalOutings: requests.length,
        approved: requests.filter(r => r.status === 'approved').length,
        pending: requests.filter(r => r.status === 'pending').length,
        denied: requests.filter(r => r.status === 'denied').length,
        emergency: requests.filter(r => r.isEmergency || r.category === 'emergency').length,
        disciplinaryActions: disciplinaryActions.length,
        suspiciousActivities: suspiciousActivities.length
      },
      dateRange: {
        start: start.toLocaleDateString(),
        end: end.toLocaleDateString()
      },
      disciplinaryActions,
      suspiciousActivities
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report-${student.rollNumber}-${Date.now()}.pdf`);

    // Generate PDF with enhanced data
    generatePDF(res, {
      title: reportTitle,
      requests,
      role: req.user.role,
      statistics,
      dateRange: {
        start,
        end
      },
      isStudentSpecific: true,
      reportType: reportType || 'outing'
    });

  } catch (error) {
    console.error('Student-specific report generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateGateActivityReport = async (req, res) => {
  try {
    const { startDate, endDate, gender } = req.query; // gender: 'male', 'female', or 'all'

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Build query for gate activity
    let gateQuery = {
      scannedAt: {
        $gte: start,
        $lte: end
      }
    };

    // Filter by gender if specified
    if (gender && gender !== 'all') {
      if (gender === 'female') {
        gateQuery.hostelBlock = 'Womens-Block';
      } else if (gender === 'male') {
        gateQuery.hostelBlock = { $in: ['D-Block', 'E-Block'] };
      }
    }

    // Get gate activity data
    const GateActivity = require('../models/GateActivity');
    const gateActivities = await GateActivity.find(gateQuery)
      .populate('studentId', 'name rollNumber hostelBlock floor roomNumber branch')
      .populate('outingRequestId', 'purpose isEmergency category')
      .sort({ scannedAt: -1 })
      .lean();

    // Get suspicious activities during the same period
    const Notification = require('../models/Notification');
    const suspiciousActivities = await Notification.find({
      type: 'securityAlert',
      createdAt: {
        $gte: start,
        $lte: end
      }
    })
    .populate('userId', 'name rollNumber hostelBlock')
    .select('title message createdAt userId')
    .sort({ createdAt: -1 })
    .lean();

    // Filter suspicious activities by gender if specified
    let filteredSuspiciousActivities = suspiciousActivities;
    if (gender && gender !== 'all') {
      filteredSuspiciousActivities = suspiciousActivities.filter(activity => {
        if (!activity.userId) return false;
        if (gender === 'female') {
          return activity.userId.hostelBlock === 'Womens-Block';
        } else if (gender === 'male') {
          return ['D-Block', 'E-Block'].includes(activity.userId.hostelBlock);
        }
        return true;
      });
    }

    // Generate statistics
    const statistics = {
      totalActivities: gateActivities.length,
      studentsOut: gateActivities.filter(a => a.type === 'out').length,
      studentsIn: gateActivities.filter(a => a.type === 'in').length,
      emergencyOutings: gateActivities.filter(a => 
        a.outingRequestId?.isEmergency || a.outingRequestId?.category === 'emergency'
      ).length,
      suspiciousActivities: filteredSuspiciousActivities.length,
      byBlock: {
        'D-Block': gateActivities.filter(a => a.studentId?.hostelBlock === 'D-Block').length,
        'E-Block': gateActivities.filter(a => a.studentId?.hostelBlock === 'E-Block').length,
        'Womens-Block': gateActivities.filter(a => a.studentId?.hostelBlock === 'Womens-Block').length
      },
      dateRange: {
        start: start.toLocaleDateString(),
        end: end.toLocaleDateString()
      },
      suspiciousActivities: filteredSuspiciousActivities
    };

    // Generate report title
    const genderText = gender === 'female' ? 'Women\'s' : gender === 'male' ? 'Men\'s' : 'All Students';
    const reportTitle = `Gate Activity Report - ${genderText} (${start.toLocaleDateString()} to ${end.toLocaleDateString()})`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=gate-activity-${gender || 'all'}-${Date.now()}.pdf`);

    // Generate PDF with gate activity data
    generatePDF(res, {
      title: reportTitle,
      requests: gateActivities.map(activity => ({
        ...activity,
        studentId: activity.studentId,
        outingTime: new Date(activity.scannedAt).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        returnTime: activity.type === 'in' ? 'RETURNED' : 'OUT',
        purpose: activity.outingRequestId?.purpose || 'Gate Activity',
        status: activity.type === 'out' ? 'OUT' : 'IN',
        isEmergency: activity.outingRequestId?.isEmergency || activity.outingRequestId?.category === 'emergency'
      })),
      role: req.user.role,
      statistics,
      dateRange: {
        start,
        end
      },
      isGateReport: true,
      reportType: 'gate'
    });

  } catch (error) {
    console.error('Gate activity report generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
