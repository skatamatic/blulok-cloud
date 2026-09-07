// Shared data for comprehensive reports

export const occupancyData = [
  { month: 'Jan', occupancy: 78, vacant: 25, revenue: 125000, moveIns: 12, moveOuts: 8 },
  { month: 'Feb', occupancy: 78, vacant: 58, revenue: 125000, moveIns: 15, moveOuts: 10 },
  { month: 'Mar', occupancy: 89, vacant: 68, revenue: 142000, moveIns: 18, moveOuts: 12 },
  { month: 'Apr', occupancy: 88, vacant: 68, revenue: 140000, moveIns: 14, moveOuts: 9 },
  { month: 'May', occupancy: 78, vacant: 79, revenue: 125000, moveIns: 16, moveOuts: 11 },
  { month: 'Jun', occupancy: 78, vacant: 72, revenue: 125000, moveIns: 13, moveOuts: 8 },
  { month: 'Jul', occupancy: 79, vacant: 76, revenue: 126000, moveIns: 17, moveOuts: 10 },
  { month: 'Aug', occupancy: 78, vacant: 73, revenue: 125000, moveIns: 15, moveOuts: 9 },
  { month: 'Sep', occupancy: 45, vacant: 72, revenue: 72000, moveIns: 8, moveOuts: 45 },
  { month: 'Oct', occupancy: 45, vacant: 90, revenue: 72000, moveIns: 6, moveOuts: 12 },
  { month: 'Nov', occupancy: 35, vacant: 90, revenue: 56000, moveIns: 4, moveOuts: 8 },
  { month: 'Dec', occupancy: 25, vacant: 100, revenue: 40000, moveIns: 2, moveOuts: 6 },
];

export const unitTypeData = [
  { type: 'Small (5x5)', total: 65, vacant: 45, occupied: 20 },
  { type: 'Medium (10x10)', total: 50, vacant: 30, occupied: 20 },
  { type: 'Large (10x20)', total: 60, vacant: 15, occupied: 45 },
  { type: 'XL (10x30)', total: 70, vacant: 25, occupied: 45 },
];

export const securityEventsData = [
  { month: 'Jan', total: 3, critical: 0, resolved: 3 },
  { month: 'Feb', total: 2, critical: 0, resolved: 2 },
  { month: 'Mar', total: 5, critical: 1, resolved: 4 },
  { month: 'Apr', total: 4, critical: 0, resolved: 4 },
  { month: 'May', total: 6, critical: 1, resolved: 5 },
  { month: 'Jun', total: 3, critical: 0, resolved: 3 },
];

export const maintenanceData = [
  { month: 'Jan', open: 8, completed: 12, overdue: 2 },
  { month: 'Feb', open: 6, completed: 10, overdue: 1 },
  { month: 'Mar', open: 9, completed: 15, overdue: 3 },
  { month: 'Apr', open: 7, completed: 11, overdue: 1 },
  { month: 'May', open: 10, completed: 14, overdue: 2 },
  { month: 'Jun', open: 5, completed: 13, overdue: 0 },
];

export const paymentsData = [
  { month: 'Jan', collected: 95, outstanding: 5, amount: 125000 },
  { month: 'Feb', collected: 97, outstanding: 3, amount: 125000 },
  { month: 'Mar', collected: 94, outstanding: 6, amount: 142000 },
  { month: 'Apr', collected: 96, outstanding: 4, amount: 140000 },
  { month: 'May', collected: 95, outstanding: 5, amount: 125000 },
  { month: 'Jun', collected: 98, outstanding: 2, amount: 125000 },
];

export const securityEventBreakdown = [
  { date: '2024-01-15', type: 'Motion Sensor', severity: 'Medium', resolutionTime: '12 min', status: 'Resolved', zone: 'Zone C' },
  { date: '2024-01-14', type: 'Door Access', severity: 'Low', resolutionTime: '5 min', status: 'Resolved', zone: 'Zone A' },
  { date: '2024-01-13', type: 'Motion Sensor', severity: 'High', resolutionTime: '25 min', status: 'Resolved', zone: 'Zone B' },
  { date: '2024-01-12', type: 'Lock Scan', severity: 'Low', resolutionTime: '3 min', status: 'Resolved', zone: 'Zone A' },
  { date: '2024-01-11', type: 'Motion Sensor', severity: 'Medium', resolutionTime: '15 min', status: 'Resolved', zone: 'Zone C' },
];

export const workOrderList = [
  { id: 'WO-207', unit: '207', issue: 'Door Seal Inspection', priority: 'High', status: 'Overdue', assigned: 'Maintenance Team', dueDate: '2024-01-14' },
  { id: 'WO-189', unit: '189', issue: 'HVAC Filter Replacement', priority: 'Medium', status: 'In Progress', assigned: 'Vendor ABC', dueDate: '2024-01-16' },
  { id: 'WO-203', unit: '203', issue: 'Light Fixture Repair', priority: 'Low', status: 'Scheduled', assigned: 'Maintenance Team', dueDate: '2024-01-18' },
  { id: 'WO-195', unit: '195', issue: 'Lock Mechanism Service', priority: 'High', status: 'Completed', assigned: 'Vendor XYZ', dueDate: '2024-01-15' },
  { id: 'WO-178', unit: '178', issue: 'Climate Control Calibration', priority: 'Medium', status: 'Completed', assigned: 'Maintenance Team', dueDate: '2024-01-13' },
];

export const failedPayments = [
  { tenant: 'John Smith', unit: '207', amount: 125.00, method: 'Credit Card', reason: 'Insufficient Funds', date: '2024-01-15' },
  { tenant: 'Sarah Johnson', unit: '189', amount: 89.50, method: 'ACH', reason: 'Account Closed', date: '2024-01-14' },
];

export const vendorPerformance = [
  { vendor: 'Vendor ABC', responseTime: 2.5, completionRate: 98, avgCost: 150, totalJobs: 45 },
  { vendor: 'Vendor XYZ', responseTime: 3.2, completionRate: 95, avgCost: 175, totalJobs: 32 },
  { vendor: 'Maintenance Team', responseTime: 1.8, completionRate: 100, avgCost: 0, totalJobs: 128 },
];

export const zoneActivityData = [
  { zone: 'Zone A', events: 12, critical: 1, avgResolution: 8.5 },
  { zone: 'Zone B', events: 8, critical: 2, avgResolution: 15.2 },
  { zone: 'Zone C', events: 15, critical: 0, avgResolution: 6.3 },
  { zone: 'Zone D', events: 5, critical: 0, avgResolution: 4.1 },
];

export const pestTreatmentCosts = [
  { month: 'Jan', cost: 450, units: 3 },
  { month: 'Feb', cost: 320, units: 2 },
  { month: 'Mar', cost: 580, units: 4 },
  { month: 'Apr', cost: 290, units: 2 },
  { month: 'May', cost: 510, units: 3 },
  { month: 'Jun', cost: 380, units: 2 },
];


