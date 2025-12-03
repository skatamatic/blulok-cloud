import React, { useRef, useState } from 'react';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Tab } from '@headlessui/react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell, ComposedChart } from 'recharts';
// @ts-ignore - html2pdf.js doesn't have TypeScript definitions
import html2pdf from 'html2pdf.js';

interface ComprehensiveReportViewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  reportType: 'morning-report' | 'security-incident' | 'pest-response' | 'occupancy';
  facilityName?: string;
}

// Data for different report types
const occupancyData = [
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

const unitTypeData = [
  { type: 'Small (5x5)', total: 65, vacant: 45, occupied: 20 },
  { type: 'Medium (10x10)', total: 50, vacant: 30, occupied: 20 },
  { type: 'Large (10x20)', total: 60, vacant: 15, occupied: 45 },
  { type: 'XL (10x30)', total: 70, vacant: 25, occupied: 45 },
];

const securityEventsData = [
  { month: 'Jan', total: 3, critical: 0, resolved: 3 },
  { month: 'Feb', total: 2, critical: 0, resolved: 2 },
  { month: 'Mar', total: 5, critical: 1, resolved: 4 },
  { month: 'Apr', total: 4, critical: 0, resolved: 4 },
  { month: 'May', total: 6, critical: 1, resolved: 5 },
  { month: 'Jun', total: 3, critical: 0, resolved: 3 },
];

const maintenanceData = [
  { month: 'Jan', open: 8, completed: 12, overdue: 2 },
  { month: 'Feb', open: 6, completed: 10, overdue: 1 },
  { month: 'Mar', open: 9, completed: 15, overdue: 3 },
  { month: 'Apr', open: 7, completed: 11, overdue: 1 },
  { month: 'May', open: 10, completed: 14, overdue: 2 },
  { month: 'Jun', open: 5, completed: 13, overdue: 0 },
];

const paymentsData = [
  { month: 'Jan', collected: 95, outstanding: 5, amount: 125000 },
  { month: 'Feb', collected: 97, outstanding: 3, amount: 125000 },
  { month: 'Mar', collected: 94, outstanding: 6, amount: 142000 },
  { month: 'Apr', collected: 96, outstanding: 4, amount: 140000 },
  { month: 'May', collected: 95, outstanding: 5, amount: 125000 },
  { month: 'Jun', collected: 98, outstanding: 2, amount: 125000 },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Additional data for enhanced reports
const securityEventBreakdown = [
  { date: '2024-01-15', type: 'Motion Sensor', severity: 'Medium', resolutionTime: '12 min', status: 'Resolved', zone: 'Zone C' },
  { date: '2024-01-14', type: 'Door Access', severity: 'Low', resolutionTime: '5 min', status: 'Resolved', zone: 'Zone A' },
  { date: '2024-01-13', type: 'Motion Sensor', severity: 'High', resolutionTime: '25 min', status: 'Resolved', zone: 'Zone B' },
  { date: '2024-01-12', type: 'Lock Scan', severity: 'Low', resolutionTime: '3 min', status: 'Resolved', zone: 'Zone A' },
  { date: '2024-01-11', type: 'Motion Sensor', severity: 'Medium', resolutionTime: '15 min', status: 'Resolved', zone: 'Zone C' },
];

const workOrderList = [
  { id: 'WO-207', unit: '207', issue: 'Door Seal Inspection', priority: 'High', status: 'Overdue', assigned: 'Maintenance Team', dueDate: '2024-01-14' },
  { id: 'WO-189', unit: '189', issue: 'HVAC Filter Replacement', priority: 'Medium', status: 'In Progress', assigned: 'Vendor ABC', dueDate: '2024-01-16' },
  { id: 'WO-203', unit: '203', issue: 'Light Fixture Repair', priority: 'Low', status: 'Scheduled', assigned: 'Maintenance Team', dueDate: '2024-01-18' },
  { id: 'WO-195', unit: '195', issue: 'Lock Mechanism Service', priority: 'High', status: 'Completed', assigned: 'Vendor XYZ', dueDate: '2024-01-15' },
  { id: 'WO-178', unit: '178', issue: 'Climate Control Calibration', priority: 'Medium', status: 'Completed', assigned: 'Maintenance Team', dueDate: '2024-01-13' },
];

const failedPayments = [
  { tenant: 'John Smith', unit: '207', amount: 125.00, method: 'Credit Card', reason: 'Insufficient Funds', date: '2024-01-15' },
  { tenant: 'Sarah Johnson', unit: '189', amount: 89.50, method: 'ACH', reason: 'Account Closed', date: '2024-01-14' },
];

const vendorPerformance = [
  { vendor: 'Vendor ABC', responseTime: 2.5, completionRate: 98, avgCost: 150, totalJobs: 45 },
  { vendor: 'Vendor XYZ', responseTime: 3.2, completionRate: 95, avgCost: 175, totalJobs: 32 },
  { vendor: 'Maintenance Team', responseTime: 1.8, completionRate: 100, avgCost: 0, totalJobs: 128 },
];

const vacantUnitsList = [
  { unit: '101', type: 'Small (5x5)', daysVacant: 12, lastTenant: 'Mike Davis', revenueLoss: 150 },
  { unit: '102', type: 'Small (5x5)', daysVacant: 8, lastTenant: 'Lisa Brown', revenueLoss: 100 },
  { unit: '203', type: 'Medium (10x10)', daysVacant: 25, lastTenant: 'Tom Wilson', revenueLoss: 312.50 },
  { unit: '207', type: 'Medium (10x10)', daysVacant: 5, lastTenant: 'Jane Doe', revenueLoss: 62.50 },
  { unit: '301', type: 'Large (10x20)', daysVacant: 18, lastTenant: 'Bob Smith', revenueLoss: 450 },
];

const zoneActivityData = [
  { zone: 'Zone A', events: 12, critical: 1, avgResolution: 8.5 },
  { zone: 'Zone B', events: 8, critical: 2, avgResolution: 15.2 },
  { zone: 'Zone C', events: 15, critical: 0, avgResolution: 6.3 },
  { zone: 'Zone D', events: 5, critical: 0, avgResolution: 4.1 },
];

const pestTreatmentCosts = [
  { month: 'Jan', cost: 450, units: 3 },
  { month: 'Feb', cost: 320, units: 2 },
  { month: 'Mar', cost: 580, units: 4 },
  { month: 'Apr', cost: 290, units: 2 },
  { month: 'May', cost: 510, units: 3 },
  { month: 'Jun', cost: 380, units: 2 },
];

// Helper function for tab styling
const tabClass = (selected: boolean) =>
  selected
    ? 'px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
    : 'px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-b-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600';

export const ComprehensiveReportView: React.FC<ComprehensiveReportViewProps> = ({
  isOpen,
  onClose,
  title,
  reportType,
  facilityName = 'Denver Facility',
}) => {
  const reportRef = useRef<HTMLDivElement>(null);

  const handleExportPDF = () => {
    if (!reportRef.current) return;

    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: `${title.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    };

    html2pdf().set(opt).from(reportRef.current).save();
  };

  const renderMorningReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8">
      {/* Header */}
      <div className="border-b-2 border-gray-200 dark:border-gray-700 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400">{facilityName} • {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Executive Summary - More professional styling */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Security Events</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white mb-1">1</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Overnight activity</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-yellow-500 dark:border-l-yellow-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Work Orders</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white mb-1">2</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">1 overdue</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Occupancy</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white mb-1">92%</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">44 vacant units</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Payments</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white mb-1">24</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">2 failed</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Occupancy Trend */}
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Occupancy Trend (12 Months)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={occupancyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="occupancy" name="Occupancy %" stroke="#3b82f6" strokeWidth={3} fill="url(#occupancyGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Move-ins vs Move-outs */}
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Move-ins vs Move-outs (Last 6 Months)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={occupancyData.slice(-6)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="moveIns" name="Move-ins" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                <Bar dataKey="moveOuts" name="Move-outs" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Unit Type Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Unit Type Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitTypeData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="type" stroke="#6b7280" className="dark:stroke-gray-400" angle={-45} textAnchor="end" height={80} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="total" name="Total Units" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                <Bar dataKey="vacant" name="Vacant" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                <Bar dataKey="occupied" name="Occupied" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Collection */}
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Payment Collection Rate</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={paymentsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="paymentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Collection %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="collected" name="Collection %" stroke="#10b981" strokeWidth={3} fill="url(#paymentGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Tables - More professional styling */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Security Events Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">Overnight Activity</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Upper Hallway – Zone C</div>
              </div>
              <span className="px-2.5 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded text-xs font-medium">Resolved</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-yellow-500 dark:border-l-yellow-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Maintenance Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">Door Seal Inspection</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Unit 207 • 1 day overdue</div>
              </div>
              <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded text-xs font-medium">Overdue</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecurityReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8">
      <div className="border-b-2 border-gray-200 dark:border-gray-700 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400">{facilityName} • {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-red-500 dark:border-l-red-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Total Events</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">23</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Critical</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">2</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Resolved</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">21</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-red-500 dark:border-l-red-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Security Events Trend (Last 6 Months)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={securityEventsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
              <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '0.75rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  padding: '12px'
                }} 
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="total" name="Total Events" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="critical" name="Critical" fill="#ef4444" radius={[8, 8, 0, 0]} />
              <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderOccupancyReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8">
      <div className="border-b-2 border-gray-200 dark:border-gray-700 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400">{facilityName} • {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Total Units</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">200</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Occupied</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">165</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">82.5%</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Vacant</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">35</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">17.5%</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Net Growth</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">+27</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Last 3 months</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">12-Month Occupancy & Revenue Trend</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={occupancyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="occupancyGradient3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="revenueGradient2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis yAxisId="left" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
                <YAxis yAxisId="right" orientation="right" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Revenue ($)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Area yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="#3b82f6" strokeWidth={3} fill="url(#occupancyGradient3)" />
                <Area yAxisId="right" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#10b981" strokeWidth={3} fill="url(#revenueGradient2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Move-ins vs Move-outs</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={occupancyData.slice(-6)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="moveIns" name="Move-ins" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                <Bar dataKey="moveOuts" name="Move-outs" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Unit Type Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitTypeData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="type" stroke="#6b7280" className="dark:stroke-gray-400" angle={-45} textAnchor="end" height={80} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="total" name="Total Units" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                <Bar dataKey="vacant" name="Vacant" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                <Bar dataKey="occupied" name="Occupied" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-indigo-500 dark:border-l-indigo-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Occupancy by Floor</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { floor: '1st', occupancy: 88, vacant: 12 },
                { floor: '2nd', occupancy: 80, vacant: 20 },
                { floor: '3rd', occupancy: 85, vacant: 15 },
                { floor: '4th', occupancy: 75, vacant: 25 },
              ]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                <XAxis dataKey="floor" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="occupancy" name="Occupied %" fill="#10b981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="vacant" name="Vacant %" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPestResponseReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8">
      <div className="border-b-2 border-gray-200 dark:border-gray-700 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400">{facilityName} • {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Work Order</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">#237</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Completed</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Response Time</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">3:30 PM</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Same day</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Completion Time</div>
          <div className="text-3xl font-semibold text-gray-900 dark:text-white">17 min</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">3:47 PM</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Workflow Timeline</h3>
        <div className="space-y-2">
          {[
            { step: 1, time: '3:00 PM', action: 'Work Order Created', status: 'completed' },
            { step: 2, time: '3:05 PM', action: 'Tenant Notified', status: 'completed' },
            { step: 3, time: '3:15 PM', action: 'Vendor Contacted', status: 'completed' },
            { step: 4, time: '3:20 PM', action: 'Access Window Created', status: 'completed' },
            { step: 5, time: '3:30 PM', action: 'Contractor Arrived', status: 'completed' },
            { step: 6, time: '3:47 PM', action: 'Treatment Completed', status: 'completed' },
            { step: 7, time: '3:48 PM', action: 'Work Order Closed', status: 'completed' },
          ].map((item) => (
            <div key={item.step} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 dark:bg-green-400 text-white flex items-center justify-center font-semibold text-xs">
                ✓
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white text-sm">{item.action}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (reportType) {
      case 'morning-report':
        return renderMorningReport();
      case 'security-incident':
        return renderSecurityReport();
      case 'occupancy':
        return renderOccupancyReport();
      case 'pest-response':
        return renderPestResponseReport();
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300" onClick={onClose} />
      
      <div className={`fixed right-0 top-0 bottom-0 w-full max-w-5xl bg-gray-50 dark:bg-gray-900 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                Export PDF
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <XMarkIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
};

