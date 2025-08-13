const PDFDocument = require('pdfkit');

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
          
          // Column layout exactly matching your screenshot
          const columns = [
            { x: tableStartX, width: 30, title: 'S.N', align: 'center' },
            { x: tableStartX + 30, width: 85, title: 'Student Name', align: 'left' },
            { x: tableStartX + 115, width: 65, title: 'Roll Number', align: 'left' },
            { x: tableStartX + 180, width: 45, title: 'Block/ Room', align: 'center' },
            { x: tableStartX + 225, width: 40, title: 'Branch', align: 'center' },
            { x: tableStartX + 265, width: 45, title: 'Out Time', align: 'center' },
            { x: tableStartX + 310, width: 45, title: 'Return Time', align: 'center' },
            { x: tableStartX + 355, width: 75, title: 'Purpose', align: 'left' },
            { x: tableStartX + 430, width: 35, title: 'Type', align: 'center' },
            { x: tableStartX + 465, width: 65, title: 'Floor Incharge', align: 'left' },
            { x: tableStartX + 530, width: 65, title: 'Hostel Incharge', align: 'left' },
            { x: tableStartX + 595, width: 50, title: 'Status', align: 'center' },
            { x: tableStartX + 645, width: 35, title: 'Alerts', align: 'center' }
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

          // Draw table data
          doc.fontSize(7).font('Helvetica');
          reqType.data.forEach((activity, index) => {
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

            // Draw row background (alternate colors)
            doc.fillColor(index % 2 === 0 ? '#ffffff' : '#f8f9fa')
               .rect(tableStartX, currentY, totalTableWidth, rowHeight)
               .fill();

            // Draw row border
            doc.strokeColor('#e5e7eb')
               .lineWidth(0.5)
               .rect(tableStartX, currentY, totalTableWidth, rowHeight)
               .stroke();

            // Format times based on activity type
            const outTime = activity.type === 'OUT' || activity.type === 'out' 
              ? new Date(activity.scannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '—';
            
            const returnTime = activity.type === 'IN' || activity.type === 'in'
              ? new Date(activity.scannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '—';

            // Determine request type and emergency status
            const isEmergency = activity.isEmergency || activity.category === 'emergency';
            const typeText = reqType.type === 'home' ? 'HOME' : (isEmergency ? 'EMRG' : 'REG');
            
            // Status and alerts
            const status = activity.status || 'APPROVE';
            const alertText = isEmergency ? '⚠️' : '—';

            // Prepare row data exactly matching your screenshot
            const rowData = [
              { text: (index + 1).toString(), align: 'center' },
              { text: (activity.student?.name || 'N/A').substring(0, 12), align: 'left' },
              { text: activity.student?.rollNumber || 'N/A', align: 'left' },
              { text: `${activity.student?.hostelBlock?.replace('-Block', '') || 'N/A'}/${activity.student?.roomNumber || 'N/A'}`, align: 'center' },
              { text: activity.student?.branch || 'CSE', align: 'center' },
              { text: outTime, align: 'center' },
              { text: returnTime, align: 'center' },
              { text: (activity.purpose || 'General Outing').substring(0, 10), align: 'left' },
              { text: typeText, align: 'center' },
              { text: '—', align: 'left' }, // Floor Incharge
              { text: '—', align: 'left' }, // Hostel Incharge
              { text: status.toUpperCase(), align: 'center' },
              { text: alertText, align: 'center' }
            ];

            // Draw row data
            doc.fillColor('#000000');
            columns.forEach((column, colIndex) => {
              doc.text(rowData[colIndex].text, column.x + 2, currentY + 5, {
                width: column.width - 4,
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