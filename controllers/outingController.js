const OutingRequest = require('../models/OutingRequest');
const Notification = require('../models/Notification');
const User = require('../models/User');

exports.createOutingRequest = async (req, res) => {
  try {
    const { date, outTime, inTime, purpose, parentContact } = req.body;
    const studentId = req.user.id;

    // Find floor incharge for the student's hostel block
    const floorIncharge = await User.findOne({
      role: 'floorIncharge',
      hostelBlock: req.user.hostelBlock
    });

    if (!floorIncharge) {
      return res.status(404).json({
        success: false,
        message: 'Floor incharge not found for your hostel block'
      });
    }

    const outingRequest = new OutingRequest({
      studentId,
      floorInchargeId: floorIncharge._id,
      date,
      outTime,
      inTime,
      purpose,
      parentContact
    });

    await outingRequest.save();

    // Create notification for floor incharge
    await Notification.create({
      userId: floorIncharge._id,
      title: 'New Outing Request',
      message: `New outing request from ${req.user.name} (${req.user.rollNumber})`,
      type: 'outingRequest',
      referenceId: outingRequest._id
    });

    res.status(201).json({
      success: true,
      request: outingRequest
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getStudentOutingRequests = async (req, res) => {
  try {
    const requests = await OutingRequest.find({ studentId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('floorInchargeId', 'name email');

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getFloorInchargeRequests = async (req, res) => {
  try {
    const requests = await OutingRequest.find({ floorInchargeId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('studentId', 'name rollNumber hostelBlock roomNumber');

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateRequestStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, remarks } = req.body;

    const request = await OutingRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    request.status = status;
    await request.save();

    // Create notification for student
    await Notification.create({
      userId: request.studentId,
      title: `Outing Request ${status}`,
      message: `Your outing request for ${new Date(request.date).toLocaleDateString()} has been ${status}${remarks ? `: ${remarks}` : ''}`,
      type: 'outingUpdate',
      referenceId: request._id
    });

    res.json({
      success: true,
      request
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message 
    });
  }
};
