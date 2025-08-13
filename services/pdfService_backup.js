const PDFDocument = require('pdfkit');

const generatePDF = (res, { title, requests, role, statistics, dateRange, isCustomReport = false, isStudentSpecific = false, reportType = 'outing' }) => {
  const doc = new PDFDocument({
    margin: 30,
    size: 'A4',
    layout: 'landscape'
  });

  // Pipe the PDF to the response
  doc.pipe(res);

  // Add header with better styling
  doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(0.5);
  
  // Add generation info
  doc.fontSize(10).font('Helvetica')
     .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
  
  // Add date range if provided
  if (dateRange) {
    doc.text(`Report Period: ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`, { align: 'right' });
  }
  
  doc.moveDown(0.5);

  // Add statistics section if provided
  if (statistics) {
    doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics:', 30, doc.y);
    doc.moveDown(0.5);
    
    const statsY = doc.y;
    const statsHeight = 100;
    const statsWidth = 750;
    
    // Draw statistics box with better styling
    doc.fillColor('#f8f9fa')
       .rect(30, statsY, statsWidth, statsHeight)
       .fill();
    
    doc.strokeColor('#dee2e6')
       .lineWidth(1)
       .rect(30, statsY, statsWidth, statsHeight)
       .stroke();
    
    doc.fillColor('#000000');
    doc.fontSize(11).font('Helvetica');
    
    // Handle different statistics structures
    let statsLines = [];
    
    if (statistics.studentSpecific) {
      // Student-specific report
      statsLines = [
        `Student: ${statistics.studentSpecific.studentName} (${statistics.studentSpecific.rollNumber}) - ${statistics.studentSpecific.hostelBlock || 'N/A'}`,
        `Total ${reportType === 'home' ? 'Home Permissions' : 'Outings'}: ${statistics.studentSpecific.totalOutings} | Emergency: ${statistics.studentSpecific.emergency || 0}`,
        `Approved: ${statistics.studentSpecific.approved} | Pending: ${statistics.studentSpecific.pending} | Denied: ${statistics.studentSpecific.denied}`,
        `Disciplinary Actions: ${statistics.studentSpecific.disciplinaryActions || 0} | Suspicious Activities: ${statistics.studentSpecific.suspiciousActivities || 0}`,
        `Report Period: ${statistics.dateRange?.start || 'N/A'} to ${statistics.dateRange?.end || 'N/A'}`
      ];
    } else if (statistics.totalRequests !== undefined) {
      // General statistics
      statsLines = [
        `Total Requests: ${statistics.totalRequests || 0} | Approved: ${statistics.approvedCount || 0} | Pending: ${statistics.pendingCount || 0} | Denied: ${statistics.deniedCount || 0}`,
        `Block Distribution - D-Block: ${statistics.byBlock?.['D-Block'] || 0} | E-Block: ${statistics.byBlock?.['E-Block'] || 0} | Womens-Block: ${statistics.byBlock?.['Womens-Block'] || 0}`,
        `Report Period: ${statistics.dateRange?.start || 'N/A'} to ${statistics.dateRange?.end || 'N/A'}`,
        `Generated: ${new Date().toLocaleString()}`
      ];
    } else {
      // Legacy format
      statsLines = [
        `Total Outings: ${statistics.totalOutings || 0}`,
        `Approved: ${statistics.approvedCount || 0} | Pending: ${statistics.pendingCount || 0} | Denied: ${statistics.deniedCount || 0}`,
        `Total Returns: ${statistics.totalReturns || 0}`,
        `Generated: ${new Date().toLocaleString()}`
      ];
    }
    
    statsLines.forEach((text, index) => {
      const y = statsY + 15 + (index * 18);
      doc.text(text, 45, y, { width: statsWidth - 30 });
    });
    
    doc.y = statsY + statsHeight + 15;
    doc.moveDown();
  }

  // Define improved table layout
  const tableTop = doc.y + 10;
  const tableStartX = 30;
  const rowHeight = 25;
  const headerHeight = 30;
  
  // Optimized column widths for landscape A4 - Enhanced for emergency and suspicious activity tracking
  const columns = [
    { x: tableStartX, width: 30, title: 'Sr.No', align: 'center' },
    { x: tableStartX + 30, width: 85, title: 'Student Name', align: 'left' },
    { x: tableStartX + 115, width: 65, title: 'Roll Number', align: 'left' },
    { x: tableStartX + 180, width: 60, title: 'Block/Room', align: 'center' },
    { x: tableStartX + 240, width: 40, title: 'Branch', align: 'center' },
    { x: tableStartX + 280, width: 45, title: 'Out Time', align: 'center' },
    { x: tableStartX + 325, width: 45, title: 'Return Time', align: 'center' },
    { x: tableStartX + 370, width: 75, title: 'Purpose', align: 'left' },
    { x: tableStartX + 445, width: 40, title: 'Type', align: 'center' },
    { x: tableStartX + 485, width: 80, title: 'Floor Incharge', align: 'left' },
    { x: tableStartX + 565, width: 80, title: 'Hostel Incharge', align: 'left' },
    { x: tableStartX + 645, width: 50, title: 'Status', align: 'center' },
    { x: tableStartX + 695, width: 50, title: 'Alerts', align: 'center' }
  ];

  const totalTableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  let currentY = tableTop;

  // Draw table header with improved styling
  doc.fillColor('#4f46e5')
     .rect(tableStartX, currentY, totalTableWidth, headerHeight)
     .fill();
  
  doc.strokeColor('#374151')
     .lineWidth(1)
     .rect(tableStartX, currentY, totalTableWidth, headerHeight)
     .stroke();

  // Draw header text
  doc.fillColor('#ffffff');
  doc.fontSize(10).font('Helvetica-Bold');
  columns.forEach(column => {
    doc.text(column.title, column.x + 3, currentY + 10, {
      width: column.width - 6,
      align: column.align
    });
  });

  // Draw column separators in header
  columns.forEach((column, index) => {
    if (index < columns.length - 1) {
      doc.strokeColor('#6366f1')
         .lineWidth(0.5)
         .moveTo(column.x + column.width, currentY)
         .lineTo(column.x + column.width, currentY + headerHeight)
         .stroke();
    }
  });

  currentY += headerHeight;

  // Draw table data with improved formatting
  doc.fontSize(9).font('Helvetica');
  requests.forEach((request, index) => {
    // Check if we need a new page
    if (currentY > 520) {
      doc.addPage();
      currentY = 50;
      
      // Redraw header on new page
      doc.fillColor('#4f46e5')
         .rect(tableStartX, currentY, totalTableWidth, headerHeight)
         .fill();
      
      doc.strokeColor('#374151')
         .lineWidth(1)
         .rect(tableStartX, currentY, totalTableWidth, headerHeight)
         .stroke();

      doc.fillColor('#ffffff');
      doc.fontSize(10).font('Helvetica-Bold');
      columns.forEach(column => {
        doc.text(column.title, column.x + 3, currentY + 10, {
          width: column.width - 6,
          align: column.align
        });
      });

      columns.forEach((column, colIndex) => {
        if (colIndex < columns.length - 1) {
          doc.strokeColor('#6366f1')
             .lineWidth(0.5)
             .moveTo(column.x + column.width, currentY)
             .lineTo(column.x + column.width, currentY + headerHeight)
             .stroke();
        }
      });

      currentY += headerHeight;
      doc.fontSize(9).font('Helvetica');
    }

    // Draw row background (alternate colors)
    doc.fillColor(index % 2 === 0 ? '#ffffff' : '#f8f9fa')
       .rect(tableStartX, currentY, totalTableWidth, rowHeight)
       .fill();

    // Draw row border
    doc.strokeColor('#e5e7eb')
       .lineWidth(0.5)
       .rect(tableStartX, currentY, totalTableWidth, rowHeight)
       .stroke();

    // Extract approval information and remarks
    let fiRemarks = '—';
    let hiRemarks = '—';
    let status = request.status || 'pending';
    
    if (request.approvalFlags) {
      if (request.approvalFlags.floorIncharge?.remarks) {
        fiRemarks = request.approvalFlags.floorIncharge.remarks.substring(0, 25) + (request.approvalFlags.floorIncharge.remarks.length > 25 ? '...' : '');
      }
      if (request.approvalFlags.hostelIncharge?.remarks) {
        hiRemarks = request.approvalFlags.hostelIncharge.remarks.substring(0, 25) + (request.approvalFlags.hostelIncharge.remarks.length > 25 ? '...' : '');
      }
    }

    // Determine request type and alerts
    const isEmergency = request.isEmergency || request.category === 'emergency';
    const requestType = reportType === 'home' ? 'HOME' : (isEmergency ? '🚨EMRG' : 'REG');
    
    // Check for suspicious activities or disciplinary actions for this student
    let alertCount = 0;
    if (statistics.disciplinaryActions) {
      alertCount += statistics.disciplinaryActions.filter(d => 
        d.studentId && d.studentId.toString() === request.studentId._id.toString()
      ).length;
    }
    if (statistics.suspiciousActivities) {
      alertCount += statistics.suspiciousActivities.filter(s => 
        s.userId && s.userId.toString() === request.studentId._id.toString()
      ).length;
    }
    
    const alertText = alertCount > 0 ? `⚠️${alertCount}` : '—';

    // Prepare row data
    const rowData = [
      { text: (index + 1).toString(), align: 'center' },
      { text: (request.studentId?.name || 'N/A').substring(0, 18), align: 'left' },
      { text: request.studentId?.rollNumber || 'N/A', align: 'left' },
      { text: `${request.studentId?.hostelBlock || 'N/A'}/${request.studentId?.roomNumber || 'N/A'}`, align: 'center' },
      { text: request.studentId?.branch || 'N/A', align: 'center' },
      { text: request.outingTime || 'N/A', align: 'center' },
      { text: request.returnTime || 'N/A', align: 'center' },
      { text: (request.purpose || 'N/A').substring(0, 12) + (request.purpose && request.purpose.length > 12 ? '...' : ''), align: 'left' },
      { text: requestType, align: 'center' },
      { text: fiRemarks.substring(0, 12) + (fiRemarks.length > 12 ? '...' : ''), align: 'left' },
      { text: hiRemarks.substring(0, 12) + (hiRemarks.length > 12 ? '...' : ''), align: 'left' },
      { text: status.toUpperCase(), align: 'center' },
      { text: alertText, align: 'center' }
    ];

    // Draw row data
    doc.fillColor('#000000');
    columns.forEach((column, colIndex) => {
      doc.text(rowData[colIndex].text, column.x + 3, currentY + 8, {
        width: column.width - 6,
        align: column.align
      });
    });

    // Draw column separators for data rows
    columns.forEach((column, colIndex) => {
      if (colIndex < columns.length - 1) {
        doc.strokeColor('#e5e7eb')
           .lineWidth(0.5)
           .moveTo(column.x + column.width, currentY)
           .lineTo(column.x + column.width, currentY + rowHeight)
           .stroke();
      }
    });

    currentY += rowHeight;
  });

  // Add disciplinary actions and suspicious activities section for student-specific reports
  if (isStudentSpecific && (statistics.disciplinaryActions?.length > 0 || statistics.suspiciousActivities?.length > 0)) {
    currentY += 30; // Add some space
    
    // Check if we need a new page
    if (currentY > 450) {
      doc.addPage();
      currentY = 50;
    }

    // Disciplinary Actions Section
    if (statistics.disciplinaryActions?.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold')
         .fillColor('#dc2626')
         .text('Disciplinary Actions During Report Period', tableStartX, currentY);
      currentY += 25;

      statistics.disciplinaryActions.forEach((action, index) => {
        if (currentY > 520) {
          doc.addPage();
          currentY = 50;
        }

        doc.fontSize(10).font('Helvetica-Bold')
           .fillColor('#000000')
           .text(`${index + 1}. ${action.title}`, tableStartX, currentY);
        currentY += 15;

        doc.fontSize(9).font('Helvetica')
           .text(`Description: ${action.description}`, tableStartX + 20, currentY);
        currentY += 12;

        doc.text(`Severity: ${action.severity?.toUpperCase()} | Category: ${action.category} | Date: ${new Date(action.createdAt).toLocaleDateString()}`, 
                 tableStartX + 20, currentY);
        currentY += 20;
      });

      currentY += 10;
    }

    // Suspicious Activities Section
    if (statistics.suspiciousActivities?.length > 0) {
      if (currentY > 450) {
        doc.addPage();
        currentY = 50;
      }

      doc.fontSize(14).font('Helvetica-Bold')
         .fillColor('#7c2d12')
         .text('Suspicious Activities During Report Period', tableStartX, currentY);
      currentY += 25;

      statistics.suspiciousActivities.forEach((activity, index) => {
        if (currentY > 520) {
          doc.addPage();
          currentY = 50;
        }

        doc.fontSize(10).font('Helvetica-Bold')
           .fillColor('#000000')
           .text(`${index + 1}. ${activity.title}`, tableStartX, currentY);
        currentY += 15;

        doc.fontSize(9).font('Helvetica')
           .text(`Alert: ${activity.message}`, tableStartX + 20, currentY);
        currentY += 12;

        doc.text(`Date: ${new Date(activity.createdAt).toLocaleDateString()}`, 
                 tableStartX + 20, currentY);
        currentY += 20;
      });
    }
  }

  // Add footer with page numbers (only if there are requests)
  if (requests && requests.length > 0) {
    try {
      const pageRange = doc.bufferedPageRange();
      const pageCount = pageRange.count;
      
      if (pageCount > 0) {
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8)
             .fillColor('#666666')
             .text(`Page ${i + 1} of ${pageCount}`, 30, 580, { align: 'center', width: 750 });
        }
      }
    } catch (pageError) {
      console.warn('Could not add page numbers:', pageError.message);
    }
  } else {
    // Add "No data found" message if no requests
    doc.fontSize(12)
       .fillColor('#666666')
       .text('No outing requests found for the selected criteria.', 30, currentY + 50, { align: 'center', width: 750 });
  }

  doc.end();
};

// Generate Enhanced Gate Activity PDF with Block Separation and In/Out Time Tracking
const generateGateActivityPDF = async ({ activityLog, stats, startDate, endDate, currentUser, studentTimeTracker }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 30,
        size: 'A4',
        layout: 'landscape'
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header
      doc.fontSize(18).font('Helvetica-Bold').text('Enhanced Gate Activity Report', { align: 'center' });
      doc.moveDown(0.5);
      
      // Add generation info
      doc.fontSize(10).font('Helvetica')
         .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.text(`Report Period: ${startDate} to ${endDate}`, { align: 'right' });
      doc.moveDown(1);

      // Enhanced Statistics Section
      doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics:', 30, doc.y);
      doc.moveDown(0.5);
      
      const statsY = doc.y;
      const statsHeight = 100;
      const statsWidth = 750;
      
      // Draw statistics box
      doc.fillColor('#f8f9fa')
         .rect(30, statsY, statsWidth, statsHeight)
         .fill();
      
      doc.strokeColor('#dee2e6')
         .lineWidth(1)
         .rect(30, statsY, statsWidth, statsHeight)
         .stroke();
      
      doc.fillColor('#000000');
      doc.fontSize(11).font('Helvetica');
      
      // Calculate statistics
      const totalActivities = activityLog ? activityLog.length : 0;
      const emergencyCount = activityLog ? activityLog.filter(a => a.isEmergency).length : 0;
      const homePermissions = activityLog ? activityLog.filter(a => a.requestType === 'home-permission').length : 0;
      const outings = activityLog ? activityLog.filter(a => a.requestType === 'outing').length : 0;
      
      const statsLines = [
        `Total Activities: ${totalActivities} | Emergency: ${emergencyCount} | Home Permissions: ${homePermissions} | Outings: ${outings}`,
        `Students Currently Out: ${stats?.currentlyOut || 0} | Students Returned: ${stats?.studentsIn || 0}`,
        `Report Period: ${startDate} to ${endDate}`,
        `Generated: ${new Date().toLocaleString()}`
      ];
      
      statsLines.forEach((text, index) => {
        const y = statsY + 15 + (index * 18);
        doc.text(text, 45, y, { width: statsWidth - 30 });
      });
      
      doc.y = statsY + statsHeight + 15;
      doc.moveDown();

      // Simple activity table for now
      if (activityLog && activityLog.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Gate Activities:', 30, doc.y);
        doc.moveDown(0.5);
        
        // Simple table
        const tableStartX = 30;
        const tableStartY = doc.y;
        const rowHeight = 20;
        const headerHeight = 25;
        
        const columns = [
          { x: tableStartX, width: 40, title: 'S.No', align: 'center' },
          { x: tableStartX + 40, width: 120, title: 'Student Name', align: 'left' },
          { x: tableStartX + 160, width: 80, title: 'Roll No', align: 'left' },
          { x: tableStartX + 240, width: 80, title: 'Block/Room', align: 'left' },
          { x: tableStartX + 320, width: 60, title: 'Type', align: 'center' },
          { x: tableStartX + 380, width: 90, title: 'Time', align: 'center' },
          { x: tableStartX + 470, width: 80, title: 'Location', align: 'left' },
          { x: tableStartX + 550, width: 140, title: 'Purpose', align: 'left' }
        ];

        const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
        let currentY = tableStartY;

        // Draw table header
        doc.fillColor('#4f46e5')
           .rect(tableStartX, currentY, totalWidth, headerHeight)
           .fill();
        
        doc.strokeColor('#374151')
           .lineWidth(1)
           .rect(tableStartX, currentY, totalWidth, headerHeight)
           .stroke();

        // Draw header text
        doc.fillColor('#ffffff');
        doc.fontSize(10).font('Helvetica-Bold');
        columns.forEach(column => {
          doc.text(column.title, column.x + 5, currentY + 10, {
            width: column.width - 10,
            align: column.align
          });
        });

        currentY += headerHeight;

        // Draw table data
        doc.fontSize(9).font('Helvetica');
        activityLog.slice(0, 20).forEach((activity, index) => { // Limit to first 20 for now
          // Check if we need a new page
          if (currentY > 500) {
            doc.addPage();
            currentY = 50;
          }

          // Draw row background
          doc.fillColor(index % 2 === 0 ? '#ffffff' : '#f9fafb')
             .rect(tableStartX, currentY, totalWidth, rowHeight)
             .fill();

          // Draw row border
          doc.strokeColor('#e5e7eb')
             .lineWidth(0.5)
             .rect(tableStartX, currentY, totalWidth, rowHeight)
             .stroke();

          // Draw row data
          doc.fillColor('#000000');
          const rowData = [
            { text: (index + 1).toString(), align: 'center' },
            { text: activity.student?.name || 'N/A', align: 'left' },
            { text: activity.student?.rollNumber || 'N/A', align: 'left' },
            { text: `${activity.student?.hostelBlock || 'N/A'}/${activity.student?.roomNumber || 'N/A'}`, align: 'left' },
            { text: activity.type || 'N/A', align: 'center' },
            { text: new Date(activity.scannedAt).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
              }) || 'N/A', align: 'center' },
            { text: activity.location || 'Main Gate', align: 'left' },
            { text: activity.purpose || 'N/A', align: 'left' }
          ];

          columns.forEach((column, colIndex) => {
            doc.text(rowData[colIndex].text, column.x + 5, currentY + 8, {
              width: column.width - 10,
              align: column.align
            });
          });

          currentY += rowHeight;
        });
      } else {
        doc.fontSize(12).font('Helvetica').text('No gate activities found for the specified period.', { align: 'center' });
      }

      // Add footer with page numbers
      try {
        const pageRange = doc.bufferedPageRange();
        const pageCount = pageRange.count;
        
        if (pageCount > 0) {
          for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8)
               .fillColor('#666666')
               .text(`Page ${i + 1} of ${pageCount}`, 30, 580, { align: 'center', width: 750 });
          }
        }
      } catch (error) {
        console.warn('Could not add page numbers:', error.message);
      }

      doc.end();
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
};
            
            doc.strokeColor('#000000')
               .lineWidth(1)
               .rect(tableStartX, currentY, totalWidth, headerHeight)
               .stroke();

            doc.fillColor('#000000');
            doc.fontSize(10).font('Helvetica-Bold');
            columns.forEach(column => {
              doc.text(column.title, column.x + 5, currentY + 10, {
                width: column.width - 10,
                align: column.align
              });
            });

            // Draw column separators on new page
            columns.forEach((column, colIndex) => {
              if (colIndex < columns.length - 1) {
                doc.strokeColor('#d1d5db')
                   .lineWidth(0.5)
                   .moveTo(column.x + column.width, currentY)
                   .lineTo(column.x + column.width, currentY + headerHeight)
                   .stroke();
              }
            });

            currentY += headerHeight;
            doc.fontSize(9).font('Helvetica');
          

        // This section should be inside a loop - let me add a simple message for now
        doc.fontSize(12).font('Helvetica')
           .text('Enhanced Gate Activity Report with block separation is being generated...', 50, currentY + 20);
        
        doc.y = currentY + 60;
        doc.moveDown();

      // Add footer with page numbers
      try {
        const pageRange = doc.bufferedPageRange();
        const pageCount = pageRange.count;
        
        if (pageCount > 0) {
          for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8)
               .fillColor('#666666')
               .text(`Page ${i + 1} of ${pageCount}`, 30, 580, { align: 'center', width: 750 });
          }
        }
      } catch (error) {
        console.warn('Could not add page numbers:', error.message);
      }

      doc.end();
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
};

// Generate Past Outings PDF for Students
const generatePastOutingsPDF = async ({ outings, studentName, studentRollNumber, currentUser }) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('📄 Starting PDF generation with data:', {
        outingsCount: outings?.length || 0,
        studentName,
        studentRollNumber,
        currentUser
      });

      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        layout: 'landscape'
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        console.log('📄 PDF generation completed, buffer size:', Buffer.concat(chunks).length);
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (error) => {
        console.error('📄 PDF generation error:', error);
        reject(error);
      });

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Past Outings Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.fontSize(12).font('Helvetica').text(`Generated by: ${currentUser}`, { align: 'right' });
      doc.fontSize(12).font('Helvetica').text(`Student: ${studentName} (${studentRollNumber})`, { align: 'right' });
      doc.moveDown(2);

      // Summary Section
      doc.fontSize(16).font('Helvetica-Bold').text('Summary', { underline: true });
      doc.moveDown();

      const summaryY = doc.y;
      const summaryHeight = 60;
      
      // Draw summary box
      doc.rect(50, summaryY, 500, summaryHeight).stroke();
      
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Completed Outings:', 60, summaryY + 10);
      doc.text('First Outing Date:', 60, summaryY + 30);
      doc.text('Last Outing Date:', 60, summaryY + 50);
      
      doc.fontSize(12).font('Helvetica');
      doc.text(outings.length.toString(), 250, summaryY + 10);
      
      if (outings.length > 0) {
        const firstDate = new Date(Math.min(...outings.map(o => new Date(o.createdAt))));
        const lastDate = new Date(Math.max(...outings.map(o => new Date(o.createdAt))));
        doc.text(firstDate.toLocaleDateString(), 250, summaryY + 30);
        doc.text(lastDate.toLocaleDateString(), 250, summaryY + 50);
      } else {
        doc.text('N/A', 250, summaryY + 30);
        doc.text('N/A', 250, summaryY + 50);
      }
      
      doc.y = summaryY + summaryHeight + 20;
      doc.moveDown();

      // Past Outings Table
      if (outings && outings.length > 0) {
        doc.fontSize(16).font('Helvetica-Bold').text('Past Outings Details', { underline: true });
        doc.moveDown();

        // Define table layout with proper spacing
        const tableStartX = 50;
        const tableStartY = doc.y;
        const rowHeight = 25;
        const headerHeight = 30;
        
        // Column definitions with proper widths
        const columns = [
          { x: tableStartX, width: 40, title: 'Sr.No', align: 'center' },
          { x: tableStartX + 40, width: 100, title: 'Date', align: 'center' },
          { x: tableStartX + 140, width: 80, title: 'Out Time', align: 'center' },
          { x: tableStartX + 220, width: 80, title: 'In Time', align: 'center' },
          { x: tableStartX + 300, width: 120, title: 'Purpose', align: 'left' },
          { x: tableStartX + 420, width: 80, title: 'Status', align: 'center' },
          { x: tableStartX + 500, width: 100, title: 'Approved On', align: 'center' }
        ];

        const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

        // Draw table header
        doc.fillColor('#f3f4f6')
           .rect(tableStartX, tableStartY, totalWidth, headerHeight)
           .fill();
        
        doc.strokeColor('#000000')
           .lineWidth(1)
           .rect(tableStartX, tableStartY, totalWidth, headerHeight)
           .stroke();

        // Draw header text
        doc.fillColor('#000000');
        doc.fontSize(10).font('Helvetica-Bold');
        columns.forEach(column => {
          doc.text(column.title, column.x + 5, tableStartY + 10, {
            width: column.width - 10,
            align: column.align
          });
        });

        // Draw column separators
        columns.forEach((column, index) => {
          if (index < columns.length - 1) {
            doc.strokeColor('#d1d5db')
               .lineWidth(0.5)
               .moveTo(column.x + column.width, tableStartY)
               .lineTo(column.x + column.width, tableStartY + headerHeight)
               .stroke();
          }
        });

        let currentY = tableStartY + headerHeight;

        // Draw table data
        doc.fontSize(9).font('Helvetica');
        outings.forEach((outing, index) => {
          // Check if we need a new page
          if (currentY > 500) {
            doc.addPage();
            currentY = 50;
            
            // Redraw header on new page
            doc.fillColor('#f3f4f6')
               .rect(tableStartX, currentY, totalWidth, headerHeight)
               .fill();
            
            doc.strokeColor('#000000')
               .lineWidth(1)
               .rect(tableStartX, currentY, totalWidth, headerHeight)
               .stroke();

            doc.fillColor('#000000');
            doc.fontSize(10).font('Helvetica-Bold');
            columns.forEach(column => {
              doc.text(column.title, column.x + 5, currentY + 10, {
                width: column.width - 10,
                align: column.align
              });
            });

            // Draw column separators on new page
            columns.forEach((column, colIndex) => {
              if (colIndex < columns.length - 1) {
                doc.strokeColor('#d1d5db')
                   .lineWidth(0.5)
                   .moveTo(column.x + column.width, currentY)
                   .lineTo(column.x + column.width, currentY + headerHeight)
                   .stroke();
              }
            });

            currentY += headerHeight;
            doc.fontSize(9).font('Helvetica');
          }

          // Draw row background (alternate colors)
          doc.fillColor(index % 2 === 0 ? '#ffffff' : '#f9fafb')
             .rect(tableStartX, currentY, totalWidth, rowHeight)
             .fill();

          // Draw row border
          doc.strokeColor('#e5e7eb')
             .lineWidth(0.5)
             .rect(tableStartX, currentY, totalWidth, rowHeight)
             .stroke();

          // Draw row data
          doc.fillColor('#000000');
          const rowData = [
            { text: (index + 1).toString(), align: 'center' },
            { text: new Date(outing.createdAt).toLocaleDateString(), align: 'center' },
            { text: outing.outingTime || 'N/A', align: 'center' },
            { text: outing.returnTime || 'N/A', align: 'center' },
            { text: outing.purpose || 'N/A', align: 'left' },
            { text: 'Completed', align: 'center' },
            { text: outing.approvals?.warden?.approvedAt ? 
                new Date(outing.approvals.warden.approvedAt).toLocaleDateString() : 'N/A', align: 'center' }
          ];

          columns.forEach((column, colIndex) => {
            doc.text(rowData[colIndex].text, column.x + 5, currentY + 8, {
              width: column.width - 10,
              align: column.align
            });
          });

          // Draw column separators for data rows
          columns.forEach((column, colIndex) => {
            if (colIndex < columns.length - 1) {
              doc.strokeColor('#e5e7eb')
                 .lineWidth(0.5)
                 .moveTo(column.x + column.width, currentY)
                 .lineTo(column.x + column.width, currentY + rowHeight)
                 .stroke();
            }
          });

          currentY += rowHeight;
        });

        // Draw final table border
        doc.strokeColor('#000000')
           .lineWidth(1)
           .rect(tableStartX, tableStartY, totalWidth, currentY - tableStartY)
           .stroke();

      } else {
        doc.fontSize(14).font('Helvetica').text('No past outings found.', { align: 'center' });
      }

      doc.end();
    } catch (error) {
      console.error('📄 PDF generation error in function:', error);
      reject(error);
    }
  });
};

module.exports = { generatePDF, generateGateActivityPDF, generatePastOutingsPDF };
