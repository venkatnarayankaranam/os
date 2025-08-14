require('dotenv').config();

let twilioClient = null;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const defaultCountryCode = process.env.TWILIO_DEFAULT_COUNTRY_CODE || '+91';

// Initialize Twilio client
try {
  if (twilioAccountSid && twilioAuthToken) {
    const twilio = require('twilio');
    twilioClient = twilio(twilioAccountSid, twilioAuthToken);
    console.log('[smsService] Twilio client initialized successfully');
  } else {
    console.warn('[smsService] Twilio credentials not set. SMS sending disabled.');
  }
} catch (error) {
  console.error('[smsService] Failed to initialize Twilio client:', error.message);
}

const toE164 = (rawNumber) => {
  if (!rawNumber) return null;
  const trimmed = String(rawNumber).trim();
  if (trimmed.startsWith('+')) return trimmed;
  
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  
  // Handle Indian numbers (10 digits)
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  
  // Handle numbers that might already have country code
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  
  // For other lengths, assume it's a complete number
  return `+${digits}`;
};

const sendSMS = async (to, body) => {
  try {
    if (!twilioClient) {
      console.warn('[smsService] Skipping SMS send; Twilio not configured.');
      return { skipped: true };
    }
    
    const toNumber = toE164(to);
    if (!toNumber) {
      console.warn('[smsService] Invalid phone number:', to);
      return { error: 'Invalid phone number' };
    }

    const messagePayload = {
      to: toNumber,
      body: body?.slice(0, 700) || '',
    };

    if (twilioMessagingServiceSid) {
      messagePayload.messagingServiceSid = twilioMessagingServiceSid;
    } else if (twilioFromNumber) {
      messagePayload.from = twilioFromNumber;
    } else {
      throw new Error('Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM_NUMBER is configured');
    }

    console.log('[smsService] Sending SMS to:', toNumber);
    const result = await twilioClient.messages.create(messagePayload);
    console.log('[smsService] SMS sent successfully. SID:', result.sid);
    return { sid: result.sid, success: true };
  } catch (error) {
    console.error('[smsService] Failed to send SMS:', error.message);
    return { error: error.message };
  }
};

// 1. Floor Incharge Approval Message
const composeFloorInchargeApprovalText = (request, requestType = 'outing') => {
  const student = request.studentId || {};
  const name = student.name || 'your ward';
  const roll = student.rollNumber ? ` (${student.rollNumber})` : '';
  
  if (requestType === 'outing') {
    const purpose = request.purpose ? ` for ${request.purpose}` : '';
    const date = request.outingDate ? new Date(request.outingDate).toISOString().split('T')[0] : '';
    const outTime = request.outingTime || '';
    const returnTime = request.returnTime || '';
    return `Your child ${name}${roll} outing request${purpose} on ${date} ${outTime}-${returnTime} has been approved by Floor Incharge and forwarded for further approval.`;
  } else {
    const town = request.homeTownName ? ` to ${request.homeTownName}` : '';
    const going = request.goingDate ? new Date(request.goingDate).toISOString().split('T')[0] : '';
    const incoming = request.incomingDate ? new Date(request.incomingDate).toISOString().split('T')[0] : '';
    return `Your child ${name}${roll} home permission request${town} (${going} to ${incoming}) has been approved by Floor Incharge and forwarded for further approval.`;
  }
};

// 2. Final Approval Message
const composeFinalApprovalText = (request, requestType = 'outing') => {
  const student = request.studentId || {};
  const name = student.name || 'your ward';
  const roll = student.rollNumber ? ` (${student.rollNumber})` : '';
  
  if (requestType === 'outing') {
    const purpose = request.purpose ? ` for ${request.purpose}` : '';
    const date = request.outingDate ? new Date(request.outingDate).toISOString().split('T')[0] : '';
    const outTime = request.outingTime || '';
    const returnTime = request.returnTime || '';
    return `Your child ${name}${roll} outing request${purpose} on ${date} ${outTime}-${returnTime} has been fully approved. QR code generated successfully.`;
  } else {
    const town = request.homeTownName ? ` to ${request.homeTownName}` : '';
    const going = request.goingDate ? new Date(request.goingDate).toISOString().split('T')[0] : '';
    const incoming = request.incomingDate ? new Date(request.incomingDate).toISOString().split('T')[0] : '';
    return `Your child ${name}${roll} home permission request${town} (${going} to ${incoming}) has been fully approved. QR codes generated successfully.`;
  }
};

// 3. Gate Check-out Message
const composeCheckoutText = (request, requestType = 'outing') => {
  const student = request.studentId || {};
  const name = student.name || 'your ward';
  const roll = student.rollNumber ? ` (${student.rollNumber})` : '';
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  
  if (requestType === 'outing') {
    const purpose = request.purpose ? ` for ${request.purpose}` : '';
    return `Your child ${name}${roll} has checked out from campus${purpose} at ${time}.`;
  } else {
    const town = request.homeTownName ? ` to ${request.homeTownName}` : '';
    return `Your child ${name}${roll} has checked out from campus${town} at ${time}.`;
  }
};

// 4. Gate Check-in Message
const composeCheckinText = (request, requestType = 'outing', isLate = false) => {
  const student = request.studentId || {};
  const name = student.name || 'your ward';
  const roll = student.rollNumber ? ` (${student.rollNumber})` : '';
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  
  let message = `Your child ${name}${roll} has returned to campus at ${time}.`;
  
  if (isLate) {
    message += ' Note: Return was later than scheduled time.';
  }
  
  return message;
};

// 5. Suspicious Activity Message
const composeSuspiciousActivityText = (request, activity) => {
  const student = request.studentId || {};
  const name = student.name || 'your ward';
  const roll = student.rollNumber ? ` (${student.rollNumber})` : '';
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString('en-IN');
  
  let message = `ALERT: Suspicious activity detected for ${name}${roll} on ${date} at ${time}.`;
  
  if (activity.remarks) {
    message += ` Details: ${activity.remarks}`;
  }
  
  if (activity.securityComment) {
    message += ` Security note: ${activity.securityComment}`;
  }
  
  return message;
};

// 6. Disciplinary Action Message
const composeDisciplinaryActionText = (disciplinaryAction) => {
  const student = disciplinaryAction.studentId || {};
  const name = student.name || 'your ward';
  const roll = student.rollNumber ? ` (${student.rollNumber})` : '';
  const title = disciplinaryAction.title || 'disciplinary action';
  const severity = disciplinaryAction.severity || 'medium';
  const date = new Date().toLocaleDateString('en-IN');
  
  let message = `NOTICE: ${title} has been issued for ${name}${roll} on ${date}.`;
  
  if (disciplinaryAction.description) {
    message += ` Details: ${disciplinaryAction.description}`;
  }
  
  message += ` Severity: ${severity.toUpperCase()}.`;
  
  return message;
};

// Main SMS sending functions
const sendFloorInchargeApprovalSMS = async (request, requestType = 'outing') => {
  try {
    const to = request.parentPhoneNumber || request.studentId?.parentPhoneNumber;
    if (!to) {
      console.warn('[smsService] No parent phone number for floor incharge approval:', request._id);
      return { skipped: true };
    }
    
    const body = composeFloorInchargeApprovalText(request, requestType);
    return await sendSMS(to, body);
  } catch (error) {
    console.error('[smsService] Error sending floor incharge approval SMS:', error.message);
    return { error: error.message };
  }
};

const sendFinalApprovalSMS = async (request, requestType = 'outing') => {
  try {
    const to = request.parentPhoneNumber || request.studentId?.parentPhoneNumber;
    if (!to) {
      console.warn('[smsService] No parent phone number for final approval:', request._id);
      return { skipped: true };
    }
    
    const body = composeFinalApprovalText(request, requestType);
    return await sendSMS(to, body);
  } catch (error) {
    console.error('[smsService] Error sending final approval SMS:', error.message);
    return { error: error.message };
  }
};

const sendCheckoutSMS = async (request, requestType = 'outing') => {
  try {
    const to = request.parentPhoneNumber || request.studentId?.parentPhoneNumber;
    if (!to) {
      console.warn('[smsService] No parent phone number for checkout:', request._id);
      return { skipped: true };
    }
    
    const body = composeCheckoutText(request, requestType);
    return await sendSMS(to, body);
  } catch (error) {
    console.error('[smsService] Error sending checkout SMS:', error.message);
    return { error: error.message };
  }
};

const sendCheckinSMS = async (request, requestType = 'outing', isLate = false) => {
  try {
    const to = request.parentPhoneNumber || request.studentId?.parentPhoneNumber;
    if (!to) {
      console.warn('[smsService] No parent phone number for checkin:', request._id);
      return { skipped: true };
    }
    
    const body = composeCheckinText(request, requestType, isLate);
    return await sendSMS(to, body);
  } catch (error) {
    console.error('[smsService] Error sending checkin SMS:', error.message);
    return { error: error.message };
  }
};

const sendSuspiciousActivitySMS = async (request, activity) => {
  try {
    const to = request.parentPhoneNumber || request.studentId?.parentPhoneNumber;
    if (!to) {
      console.warn('[smsService] No parent phone number for suspicious activity:', request._id);
      return { skipped: true };
    }
    
    const body = composeSuspiciousActivityText(request, activity);
    return await sendSMS(to, body);
  } catch (error) {
    console.error('[smsService] Error sending suspicious activity SMS:', error.message);
    return { error: error.message };
  }
};

const sendDisciplinaryActionSMS = async (disciplinaryAction) => {
  try {
    const to = disciplinaryAction.studentId?.parentPhoneNumber;
    if (!to) {
      console.warn('[smsService] No parent phone number for disciplinary action:', disciplinaryAction._id);
      return { skipped: true };
    }
    
    const body = composeDisciplinaryActionText(disciplinaryAction);
    return await sendSMS(to, body);
  } catch (error) {
    console.error('[smsService] Error sending disciplinary action SMS:', error.message);
    return { error: error.message };
  }
};

// Legacy functions for backward compatibility
const sendParentApprovalSMSForOuting = async (request) => {
  return await sendFinalApprovalSMS(request, 'outing');
};

const sendParentApprovalSMSForHomePermission = async (request) => {
  return await sendFinalApprovalSMS(request, 'home-permission');
};

module.exports = {
  sendSMS,
  toE164,
  
  // New comprehensive SMS functions
  sendFloorInchargeApprovalSMS,
  sendFinalApprovalSMS,
  sendCheckoutSMS,
  sendCheckinSMS,
  sendSuspiciousActivitySMS,
  sendDisciplinaryActionSMS,
  
  // Legacy functions
  sendParentApprovalSMSForOuting,
  sendParentApprovalSMSForHomePermission,
};


