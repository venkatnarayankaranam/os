const PDFDocument = require('pdfkit');

// Helper function to format time properly
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

// Helper function to handle text overflow and formatting
const formatTextForColumn = (text, maxWidth, columnType = 'general') => {
  if (!text) return 'N/A';
  
  const textStr = String(text);
  
  // For narrow columns, truncate with ellipsis
  if (maxWidth < 50) {
    if (textStr.length > 8) {
      return textStr.substring(0, 6) + '...';
    }
    return textStr;
  }
  
  // For medium columns, allow more text but still truncate if too long
  if (maxWidth < 80) {
    if (textStr.length > 15) {
      return textStr.substring(0, 12) + '...';
    }
    return textStr;
  }
  
  // For wide columns, allow full text but wrap if needed
  return textStr;
};

// Original PDF generation function (keeping existing functionality)
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
    
    // Display statistics
    const statsLines = [
      `Total Requests: ${statistics.total || 0}`,
      `Approved: ${statistics.approved || 0}`,
      `Pending: ${statistics.pending || 0}`,
      `Denied: ${statistics.denied || 0}`
    ];
    
    statsLines.forEach((text, index) => {
      const y = statsY + 15 + (index * 18);
      doc.text(text, 45, y, { width: statsWidth - 30 });
    });
    
    doc.y = statsY + statsHeight + 15;
    doc.moveDown();
  }

  // Add requests table
  if (requests && requests.length > 0) {
    doc.fontSize(14).font('Helvetica-Bold').text('Requests:', 30, doc.y);
    doc.moveDown(0.5);
    
    // Simple table for requests
    const tableStartX = 30;
    const tableStartY = doc.y;
    const rowHeight = 20;
    const headerHeight = 25;
    
    const columns = [
      { x: tableStartX, width: 40, title: 'S.No', align: 'center' },
      { x: tableStartX + 40, width: 120, title: 'Student Name', align: 'left' },
      { x: tableStartX + 160, width: 80, title: 'Roll No', align: 'left' },
      { x: tableStartX + 240, width: 80, title: 'Block/Room', align: 'left' },
      { x: tableStartX + 320, width: 60, title: 'Status', align: 'center' },
      { x: tableStartX + 380, width: 90, title: 'Date', align: 'center' },
      { x: tableStartX + 470, width: 140, title: 'Purpose', align: 'left' }
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
    requests.forEach((request, index) => {
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
        { text: request.studentId?.name || 'N/A', align: 'left' },
        { text: request.studentId?.rollNumber || 'N/A', align: 'left' },
        { text: `${request.studentId?.hostelBlock || 'N/A'}/${request.studentId?.roomNumber || 'N/A'}`, align: 'left' },
        { text: request.status || 'N/A', align: 'center' },
        { text: new Date(request.createdAt).toLocaleDateString() || 'N/A', align: 'center' },
        { text: request.purpose || 'N/A', align: 'left' }
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
    doc.fontSize(12).font('Helvetica').text('No requests found for the specified criteria.', { align: 'center' });
  }

  doc.end();
};

// Enhanced Gate Activity PDF with Block Separation and In/Out Time Tracking
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

      // Header matching your screenshot
      doc.fontSize(18).font('Helvetica-Bold').text('Custom Outing Report', { align: 'center' });
      doc.moveDown(0.3);
      
      // Add generation info (top right)
      doc.fontSize(10).font('Helvetica')
         .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.text(`Report Period: ${startDate} to ${endDate}`, { align: 'right' });
      doc.moveDown(0.8);

      // Summary Statistics Section
      doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics:', 30, doc.y);
      doc.moveDown(0.3);
      
      const statsY = doc.y;
      const statsHeight = 120;
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
      
      // Calculate block-wise statistics
      const blockStats = {
        'D-Block': { total: 0, emergency: 0, home: 0, outing: 0 },
        'E-Block': { total: 0, emergency: 0, home: 0, outing: 0 },
        'Womens-Block': { total: 0, emergency: 0, home: 0, outing: 0 }
      };
      
      let totalRequests = 0;
      let totalApproved = 0;
      let totalPending = 0;
      let totalDenied = 0;
      
      if (activityLog && activityLog.length > 0) {
        activityLog.forEach(activity => {
          const block = activity.student?.hostelBlock || 'Unknown';
          if (blockStats[block]) {
            blockStats[block].total++;
            
            // Check for emergency
            if (activity.isEmergency || activity.category === 'emergency') {
              blockStats[block].emergency++;
            }
            
            // Check for home vs outing
            if (activity.requestType === 'home-permission') {
              blockStats[block].home++;
            } else {
              blockStats[block].outing++;
            }
          }
          totalRequests++;
          
          // Count status (if available)
          if (activity.status === 'approved') totalApproved++;
          else if (activity.status === 'pending') totalPending++;
          else if (activity.status === 'denied') totalDenied++;
        });
      }
      
      const statsLines = [
        `Total Requests: ${totalRequests} | Approved: ${totalApproved} | Pending: ${totalPending} | Denied: ${totalDenied}`,
        `Block Distribution - D-Block: ${blockStats['D-Block'].total} | E-Block: ${blockStats['E-Block'].total} | Womens-Block: ${blockStats['Womens-Block'].total}`,
        `Emergency Permissions - D-Block: ${blockStats['D-Block'].emergency} | E-Block: ${blockStats['E-Block'].emergency} | Womens-Block: ${blockStats['Womens-Block'].emergency}`,
        `Home vs Outing - Home: ${blockStats['D-Block'].home + blockStats['E-Block'].home + blockStats['Womens-Block'].home} | Outing: ${blockStats['D-Block'].outing + blockStats['E-Block'].outing + blockStats['Womens-Block'].outing}`,
        `Report Period: ${startDate} to ${endDate}`,
        `Generated: ${new Date().toLocaleString()}`
      ];
      
      statsLines.forEach((text, index) => {
        const y = statsY + 10 + (index * 16);
        doc.text(text, 40, y, { width: statsWidth - 20 });
      });
      
      doc.y = statsY + statsHeight + 20;
      doc.moveDown();

      // Process and separate data by blocks and request types
      const separatedData = {
        'D-Block': { outing: [], home: [] },
        'E-Block': { outing: [], home: [] },
        'Womens-Block': { outing: [], home: [] }
      };
      
      if (activityLog && activityLog.length > 0) {
        activityLog.forEach(activity => {
          const block = activity.student?.hostelBlock || 'Unknown';
          const requestType = activity.requestType === 'home-permission' ? 'home' : 'outing';
          
          if (separatedData[block]) {
            separatedData[block][requestType].push(activity);
          }
        });
      }

      // Generate tables for each block (matching your screenshot format)
      const blocks = ['D-Block', 'E-Block', 'Womens-Block'];
      
      for (const block of blocks) {
        const blockData = separatedData[block];
        const totalBlockActivities = blockData.outing.length + blockData.home.length;
        
        if (totalBlockActivities === 0) continue;
        
        // Check if we need a new page
        if (doc.y > 400) {
          doc.addPage();
        }
        
        // Block header
        doc.fontSize(16).font('Helvetica-Bold')
           .fillColor('#4f46e5')
           .text(`${block} Activities (Total: ${totalBlockActivities})`, 30, doc.y);
        doc.moveDown(0.5);
        
        // Process outings first, then home permissions
        const requestTypes = [
          { type: 'outing', data: blockData.outing, title: 'Outings' },
          { type: 'home', data: blockData.home, title: 'Home Permissions' }
        ];
        
        for (const reqType of requestTypes) {
          if (reqType.data.length === 0) continue;
          
          // Check if we need a new page
          if (doc.y > 450) {
            doc.addPage();
          }
          
          // Request type subheader
          doc.fontSize(12).font('Helvetica-Bold')
             .fillColor('#000000')
             .text(`${reqType.title} (${reqType.data.length})`, 30, doc.y);
          doc.moveDown(0.3);
          
          // Define table layout matching your screenshot
          const tableTop = doc.y + 5;
          const tableStartX = 30;
          const rowHeight = 18;
          const headerHeight = 22;
          
          // Column layout exactly matching your screenshot with improved widths
          const columns = [
            { x: tableStartX, width: 35, title: 'S.N', align: 'center' },
            { x: tableStartX + 35, width: 90, title: 'Student Name', align: 'left' },
            { x: tableStartX + 125, width: 70, title: 'Roll Number', align: 'left' },
            { x: tableStartX + 195, width: 50, title: 'Block/Room', align: 'center' },
            { x: tableStartX + 245, width: 45, title: 'Branch', align: 'center' },
            { x: tableStartX + 290, width: 50, title: 'Out Time', align: 'center' },
            { x: tableStartX + 340, width: 50, title: 'Return Time', align: 'center' },
            { x: tableStartX + 390, width: 80, title: 'Purpose', align: 'left' },
            { x: tableStartX + 470, width: 40, title: 'Type', align: 'center' },
            { x: tableStartX + 510, width: 70, title: 'Floor Incharge', align: 'left' },
            { x: tableStartX + 580, width: 70, title: 'Hostel Incharge', align: 'left' },
            { x: tableStartX + 650, width: 55, title: 'Status', align: 'center' },
            { x: tableStartX + 705, width: 40, title: 'Alerts', align: 'center' }
          ];

          const totalTableWidth = columns.reduce((sum, col) => sum + col.width, 0);
          let currentY = tableTop;

          // Draw table header (purple background like your screenshot)
          doc.fillColor('#6366f1')
             .rect(tableStartX, currentY, totalTableWidth, headerHeight)
             .fill();
          
          doc.strokeColor('#374151')
             .lineWidth(1)
             .rect(tableStartX, currentY, totalTableWidth, headerHeight)
             .stroke();

          // Draw header text
          doc.fillColor('#ffffff');
          doc.fontSize(8).font('Helvetica-Bold');
          columns.forEach(column => {
            doc.text(column.title, column.x + 2, currentY + 7, {
              width: column.width - 4,
              align: column.align
            });
          });

          // Draw column separators in header
          columns.forEach((column, index) => {
            if (index < columns.length - 1) {
              doc.strokeColor('#8b5cf6')
                 .lineWidth(0.5)
                 .moveTo(column.x + column.width, currentY)
                 .lineTo(column.x + column.width, currentY + headerHeight)
                 .stroke();
            }
          });

          currentY += headerHeight;

          // Draw table data (pair OUT/IN as sessions so Return Time is correct and blank when missing)
          // Build sessions per student in chronological order
          const sortedActivities = [...reqType.data].sort((a, b) => new Date(a.scannedAt) - new Date(b.scannedAt));
          const sessions = [];
          const trackers = new Map(); // studentId -> { lastOut: activity | null }

          sortedActivities.forEach((act) => {
            const studentId = act.student?._id?.toString() || act.studentId?._id?.toString() || 'unknown';
            if (!trackers.has(studentId)) trackers.set(studentId, { lastOut: null });
            const t = trackers.get(studentId);
            const tType = (act.type || '').toLowerCase();

            if (tType === 'out') {
              if (t.lastOut) {
                // Previous OUT without IN → push open session
                sessions.push({ out: t.lastOut, in: null });
              }
              t.lastOut = act;
            } else if (tType === 'in') {
              if (t.lastOut) {
                sessions.push({ out: t.lastOut, in: act });
                t.lastOut = null;
              } else {
                // IN without prior OUT → still record session to show return time only
                sessions.push({ out: null, in: act });
              }
            }
          });
          trackers.forEach((t) => { if (t.lastOut) sessions.push({ out: t.lastOut, in: null }); });

          doc.fontSize(7).font('Helvetica');
          sessions.forEach((session, index) => {
            // Check if we need a new page
            if (currentY > 520) {
              doc.addPage();
              currentY = 50;

              // Redraw header on new page
              doc.fillColor('#6366f1')
                 .rect(tableStartX, currentY, totalTableWidth, headerHeight)
                 .fill();
              doc.strokeColor('#374151')
                 .lineWidth(1)
                 .rect(tableStartX, currentY, totalTableWidth, headerHeight)
                 .stroke();
              doc.fillColor('#ffffff');
              doc.fontSize(8).font('Helvetica-Bold');
              columns.forEach(column => {
                doc.text(column.title, column.x + 2, currentY + 7, {
                  width: column.width - 4,
                  align: column.align
                });
              });
              columns.forEach((column, colIndex) => {
                if (colIndex < columns.length - 1) {
                  doc.strokeColor('#8b5cf6')
                     .lineWidth(0.5)
                     .moveTo(column.x + column.width, currentY)
                     .lineTo(column.x + column.width, currentY + headerHeight)
                     .stroke();
                }
              });
              currentY += headerHeight;
              doc.fontSize(7).font('Helvetica');
            }

            // Row background
            doc.fillColor(index % 2 === 0 ? '#ffffff' : '#f8f9fa')
               .rect(tableStartX, currentY, totalTableWidth, rowHeight)
               .fill();
            // Row border
            doc.strokeColor('#e5e7eb')
               .lineWidth(0.5)
               .rect(tableStartX, currentY, totalTableWidth, rowHeight)
               .stroke();

            const student = session.out?.student || session.in?.student || {};
            const name = (student?.name || 'N/A');
            const roll = student?.rollNumber || 'N/A';
            const blockRoom = `${(student?.hostelBlock || 'N/A').replace('-Block', '')}/${student?.roomNumber || 'N/A'}`;
            const branch = student?.branch || 'CSE';

            const outTime = fmtTime(session.out?.scannedAt || null);
            const returnTime = fmtTime(session.in?.scannedAt || null); // blank when no IN

            const isEmergency = !!(session.out?.isEmergency || session.out?.category === 'emergency' || session.in?.isEmergency || session.in?.category === 'emergency');
            const typeText = reqType.type === 'home' ? 'HOME' : (isEmergency ? 'EMRG' : 'REG');

            const purpose = (session.out?.purpose || session.in?.purpose || 'General Outing');
            const status = (session.out?.status || session.in?.status || 'APPROVE').toUpperCase();
            const alertText = isEmergency ? '⚠️' : '—';

            const rowData = [
              { text: (index + 1).toString(), align: 'center' },
              { text: name, align: 'left' },
              { text: roll, align: 'left' },
              { text: blockRoom, align: 'center' },
              { text: branch, align: 'center' },
              { text: outTime, align: 'center' },
              { text: returnTime, align: 'center' },
              { text: purpose, align: 'left' },
              { text: typeText, align: 'center' },
              { text: '—', align: 'left' }, // Floor Incharge
              { text: '—', align: 'left' }, // Hostel Incharge
              { text: status, align: 'center' },
              { text: alertText, align: 'center' }
            ];

            // Draw row data with improved text handling
            doc.fillColor('#000000');
            columns.forEach((column, colIndex) => {
              const text = rowData[colIndex].text;
              const maxWidth = column.width - 4;
              
              // Use helper function to format text properly
              const displayText = formatTextForColumn(text, maxWidth, column.title.toLowerCase());
              
              doc.text(displayText, column.x + 2, currentY + 5, {
                width: maxWidth,
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
          
          doc.y = currentY + 15;
          doc.moveDown();
        }
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

// Generate Past Outings PDF for Students
const generatePastOutingsPDF = async ({ outings, studentName, studentRollNumber, currentUser }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        layout: 'landscape'
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Past Outings Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica').text(`Student: ${studentName} (${studentRollNumber})`, { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.fontSize(12).font('Helvetica').text(`Generated by: ${currentUser}`, { align: 'right' });
      doc.moveDown(2);

      // Past outings table
      if (outings && outings.length > 0) {
        doc.fontSize(16).font('Helvetica-Bold').text('Past Outings', { underline: true });
        doc.moveDown();

        // Define table layout
        const tableStartX = 50;
        const tableStartY = doc.y;
        const rowHeight = 25;
        const headerHeight = 30;
        
        const columns = [
          { x: tableStartX, width: 40, title: 'Sr.No', align: 'center' },
          { x: tableStartX + 40, width: 120, title: 'Purpose', align: 'left' },
          { x: tableStartX + 160, width: 80, title: 'From Date', align: 'center' },
          { x: tableStartX + 240, width: 80, title: 'To Date', align: 'center' },
          { x: tableStartX + 320, width: 60, title: 'Status', align: 'center' },
          { x: tableStartX + 380, width: 90, title: 'Approved By', align: 'left' },
          { x: tableStartX + 470, width: 80, title: 'Category', align: 'center' },
          { x: tableStartX + 550, width: 140, title: 'Remarks', align: 'left' }
        ];

        const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
        let currentY = tableStartY;

        // Draw table header
        doc.fillColor('#f3f4f6')
           .rect(tableStartX, currentY, totalWidth, headerHeight)
           .fill();
        
        doc.strokeColor('#000000')
           .lineWidth(1)
           .rect(tableStartX, currentY, totalWidth, headerHeight)
           .stroke();

        // Draw header text
        doc.fillColor('#000000');
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
        outings.forEach((outing, index) => {
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
            { text: outing.purpose || 'N/A', align: 'left' },
            { text: new Date(outing.fromDate).toLocaleDateString() || 'N/A', align: 'center' },
            { text: new Date(outing.toDate).toLocaleDateString() || 'N/A', align: 'center' },
            { text: outing.status || 'N/A', align: 'center' },
            { text: outing.approvedBy || 'N/A', align: 'left' },
            { text: outing.category || 'N/A', align: 'center' },
            { text: outing.remarks || 'N/A', align: 'left' }
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
        doc.fontSize(14).font('Helvetica').text('No past outings found.', { align: 'center' });
      }

      doc.end();
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
};

module.exports = { generatePDF, generateGateActivityPDF, generatePastOutingsPDF };