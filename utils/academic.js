// Utility for semester -> year mapping and floor incharge email routing (year-wise, per block)

function normalizeBlockSuffix(hostelBlock) {
  if (!hostelBlock) return 'd';
  const b = String(hostelBlock).trim().toLowerCase();
  if (b.startsWith('d')) return 'd';
  if (b.startsWith('e')) return 'e';
  // Support Womens-Block / W-Block variants
  if (b.startsWith('w')) return 'w';
  return 'd';
}

function mapSemesterToYearAndFloorEmail(semester, hostelBlock) {
  const sem = Number(semester) || 1;
  const suffix = normalizeBlockSuffix(hostelBlock);
  if (sem <= 2) {
    return { year: '1st', floorInchargeEmail: `floorincharge1.${suffix}@kietgroup.com` };
  }
  if (sem <= 4) {
    return { year: '2nd', floorInchargeEmail: `floorincharge2.${suffix}@kietgroup.com` };
  }
  if (sem <= 6) {
    return { year: '3rd', floorInchargeEmail: `floorincharge3.${suffix}@kietgroup.com` };
  }
  return { year: '4th', floorInchargeEmail: `floorincharge4.${suffix}@kietgroup.com` };
}

module.exports = { mapSemesterToYearAndFloorEmail };