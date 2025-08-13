const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');

const auth = async (req, res, next) => {
  try {
    let token = req.header('Authorization');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No auth token found',
      });
    }
    // Clean the token
    token = token.replace('Bearer ', '').trim();

    if (!token) {
      throw new Error('Empty token provided');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'OutingApplication@2026');

      // Check token expiration
      if (decoded.exp && decoded.exp < Date.now() / 1000) {
        throw new Error('Token expired');
      }
      

      if (decoded.role === 'hostel-incharge') {
        // Don't default to all blocks - only use what's assigned
        const assignedBlocks = decoded.assignedBlocks || [];
        console.log('🏢 Hostel Incharge Auth:', {
          email: decoded.email,
          assignedBlocks: assignedBlocks
        });
        
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
          isAdmin: decoded.isAdmin || false,
          assignedBlocks: assignedBlocks
        };
        return next();
      } 

      if (decoded.role === 'warden') {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
          isAdmin: true,
          assignedBlocks: ['D-Block', 'E-Block']
        };
        console.log('Warden auth:', {
          email: req.user.email,
          role: req.user.role,
          assignedBlocks: req.user.assignedBlocks

        });
        return next();
      }
      
      if (decoded.role.includes('-incharge') || ['gate', 'warden', 'security'].includes(decoded.role)) {
        const floors = decoded.assignedFloor || [];
        const formattedFloors = Array.isArray(floors) ? floors : [floors];
        const hostelBlock = decoded.assignedBlock || decoded.hostelBlock;
        
        req.user = {
          id: decoded.id || decoded.email,
          email: decoded.email,
          role: decoded.role,
          assignedBlock: hostelBlock,
          assignedFloor: formattedFloors,
          hostelBlock: hostelBlock,
          floor: formattedFloors
        };

        console.log('Auth middleware:', {
          email: req.user.email,
          role: req.user.role,
          id: req.user.id,
          hostelBlock: req.user.hostelBlock,
          floors: req.user.assignedFloor
        });

        return next();
      }

      // For students, look in Student collection
      if (decoded.role === 'student') {
        const Student = require('../models/Student');
        const student = await Student.findById(decoded.id);
        if (!student) {
          throw new Error('Student not found');
        }

        req.user = student;
        console.log('✅ Student authenticated:', {
          id: student._id,
          name: student.name,
          rollNumber: student.rollNumber,
          hostelBlock: student.hostelBlock,
          floor: student.floor
        });
        return next();
      }

      // For regular staff users
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new Error('User not found');
      }

      req.user = user;
      return next();

    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({
      success: false,
      message: error.message || 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    try {
      const userRole = req.user.role.toLowerCase();
      const normalizedRoles = roles.map(role => role.toLowerCase());
      
      // Handle gate/security role mapping
      if (userRole === 'gate' && normalizedRoles.includes('security')) {
        return next();
      }
      
      if (!normalizedRoles.includes(userRole)) {
        console.error('Access denied:', {
          userRole,
          allowedRoles: roles,
          path: req.path
        });
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          details: {
            userRole,
            requiredRoles: roles,
            path: req.path
          }
        });
      }
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        message: 'Role verification failed'
      });
    }
  };
};

module.exports = { auth, checkRole };