const PDFDocument = require('pdfkit');

// Unified tabular PDF (Outings + Home Permissions) with full summary and footer
const generateUnifiedOutingHomePDF = async ({
  title = 'Custom Outing Report',
  period: { startDate, endDate } = {},
  data: { outings = [], homePermissions = [] } = {},
  stats: {
    total = 0,
    approved = 0,
    pending = 0,
    denied = 0,
    blockDistribution = { 'D-Block': 0, 'E-Block': 0, 'Womens-Block': 0 },
    emergencyCount = 0,
    homeCount = 0,
    outingCount = 0
  } = {}
}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header
      doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      if (startDate && endDate) doc.text(`Report Period: ${startDate} to ${endDate}`, { align: 'right' });
      doc.moveDown(0.8);

      // Summary box
      doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics:', 30, doc.y);
      doc.moveDown(0.3);
      const statsY = doc.y, statsH = 120, statsW = 750;
      doc.fillColor('#f8f9fa').rect(30, statsY, statsW, statsH).fill();
      doc.strokeColor('#dee2e6').lineWidth(1).rect(30, statsY, statsW, statsH).stroke();
      doc.fillColor('#000').fontSize(11).font('Helvetica');

      const statsLines = [
        `Total Requests: ${total} | Approved: ${approved} | Pending: ${pending} | Denied: ${denied}`,
        `Block Distribution - D-Block: ${blockDistribution['D-Block'] || 0} | E-Block: ${blockDistribution['E-Block'] || 0} | Womens-Block: ${blockDistribution['Womens-Block'] || 0}`,
        `Emergency Permissions - D-Block: ${blockDistribution['D-Block_emg'] || 0} | E-Block: ${blockDistribution['E-Block_emg'] || 0} | Womens-Block: ${blockDistribution['Womens-Block_emg'] || 0} | Total: ${emergencyCount}`,
        `Home vs Outing - Home: ${homeCount} | Outing: ${outingCount}`,
        startDate && endDate ? `Report Period: ${startDate} to ${endDate}` : '',
        `Generated: ${new Date().toLocaleString()}`
      ].filter(Boolean);
      statsLines.forEach((t, i) => doc.text(t, 40, statsY + 10 + i * 16, { width: statsW - 20 }));
      doc.y = statsY + statsH + 20;
      doc.moveDown();

      // Helper to draw section table
      const drawTable = (sectionTitle, rows) => {
        if (!rows || rows.length === 0) return;
        if (doc.y > 450) doc.addPage();

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(`${sectionTitle} (${rows.length})`, 30, doc.y);
        doc.moveDown(0.3);

        const tableTop = doc.y + 5;
        const tableStartX = 30;
        const rowH = 20;
        const headerH = 24;

        // Wider columns for Name and Purpose for better readability
        const columns = [
          { title: 'S.N', width: 40, align: 'center' },
          { title: 'Student Name', width: 120, align: 'left' },
          { title: 'Roll Number', width: 80, align: 'left' },
          { title: 'Block/ Room', width: 80, align: 'center' },
          { title: 'Branch', width: 70, align: 'center' },
          { title: 'Out Time', width: 65, align: 'center' },
          { title: 'Return Time', width: 80, align: 'center' },
          { title: 'Purpose', width: 120, align: 'left' },
          { title: 'Type', width: 55, align: 'center' },
          { title: 'Floor Incharge Comments', width: 100, align: 'left' },
          { title: 'Hostel Incharge Comments', width: 110, align: 'left' },
          { title: 'Status', width: 60, align: 'center' },
          { title: 'Alerts', width: 40, align: 'center' }
        ];

        // Compute x positions
        let x = tableStartX;
        const cols = columns.map((c) => ({ ...c, x: (x += c.width) - c.width }));
        const totalW = cols.reduce((s, c) => s + c.width, 0);

        // Header
        let currentY = tableTop;
        doc.fillColor('#6366f1').rect(tableStartX, currentY, totalW, headerH).fill();
        doc.strokeColor('#374151').lineWidth(1).rect(tableStartX, currentY, totalW, headerH).stroke();
        doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
        cols.forEach((c) => doc.text(c.title, c.x + 3, currentY + 7, { width: c.width - 6, align: c.align }));
        currentY += headerH;

        // Rows
        doc.fontSize(10).font('Helvetica');
        rows.forEach((r, idx) => {
          if (currentY > 520) {
            doc.addPage();
            currentY = 50;
            // redraw header
            doc.fillColor('#6366f1').rect(tableStartX, currentY, totalW, headerH).fill();
            doc.strokeColor('#374151').lineWidth(1).rect(tableStartX, currentY, totalW, headerH).stroke();
            doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
            cols.forEach((c) => doc.text(c.title, c.x + 3, currentY + 7, { width: c.width - 6, align: c.align }));
            currentY += headerH;
            doc.fontSize(10).font('Helvetica');
          }

          const altBg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
          doc.fillColor(altBg).rect(tableStartX, currentY, totalW, rowH).fill();
          doc.strokeColor('#e5e7eb').lineWidth(0.5).rect(tableStartX, currentY, totalW, rowH).stroke();

          const name = r.studentId?.name || r.studentName || 'N/A';
          const roll = r.studentId?.rollNumber || r.rollNumber || 'N/A';
          const blk = r.studentId?.hostelBlock || r.hostelBlock || 'N/A';
          const room = r.studentId?.roomNumber || r.roomNumber || 'N/A';
          const branch = r.studentId?.branch || r.branch || 'N/A';

          const outTime = r.outingTime || r.outTime || (r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
          const returnTime = r.returnTime || r.checkIn?.time || r.inTime || r.incomingDate || '—';

          const purpose = r.purpose || r.homeTownName || '—';
          const isEmergency = r.isEmergency || r.category === 'emergency';
          const type = r.requestType === 'home-permission' || r.type === 'home' ? 'HOME' : (isEmergency ? 'EMRG' : 'REG');

          const floorC = r.approvalFlags?.floorIncharge?.remarks || (Array.isArray(r.approvalFlow) ? (r.approvalFlow.find(a => a.level === 'floor-incharge' || a.level === '1')?.remarks || '') : '') || '';
          const hostelC = r.approvalFlags?.hostelIncharge?.remarks || (Array.isArray(r.approvalFlow) ? (r.approvalFlow.find(a => a.level === 'hostel-incharge' || a.level === '2')?.remarks || '') : '') || '';

          const status = (r.status || 'pending').toUpperCase();
          const alertText = isEmergency ? '⚠️' : '—';

          const row = [
            { text: String(idx + 1), align: 'center' },
            { text: name, align: 'left' },
            { text: roll, align: 'left' },
            { text: `${String(blk).replace('-Block', '')}/${room}`, align: 'center' },
            { text: branch, align: 'center' },
            { text: outTime || '—', align: 'center' },
            { text: returnTime || '—', align: 'center' },
            { text: purpose, align: 'left' },
            { text: type, align: 'center' },
            { text: floorC, align: 'left' },
            { text: hostelC, align: 'left' },
            { text: status, align: 'center' },
            { text: alertText, align: 'center' }
          ];

          doc.fillColor('#000');
          cols.forEach((c, i) => doc.text(row[i].text, c.x + 3, currentY + 6, { width: c.width - 6, align: row[i].align }));

          currentY += rowH;
        });

        doc.y = currentY + 15;
        doc.moveDown();
      };

      // Sections
      drawTable('Outings', outings);
      drawTable('Home Permissions', homePermissions);

      // Footer page numbers
      try {
        const pr = doc.bufferedPageRange();
        for (let i = 0; i < pr.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).fillColor('#666').text(`Page ${i + 1} of ${pr.count}`, 30, 580, { align: 'center', width: 750 });
        }
      } catch (_) {}

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateUnifiedOutingHomePDF };