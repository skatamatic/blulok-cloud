import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface FullReportViewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  reportType: 'occupancy' | 'security' | 'maintenance' | 'payments';
}

const occupancyData = [
  { month: 'Jan', occupancy: 78, vacant: 25, revenue: 125000 },
  { month: 'Feb', occupancy: 78, vacant: 58, revenue: 125000 },
  { month: 'Mar', occupancy: 89, vacant: 68, revenue: 142000 },
  { month: 'Apr', occupancy: 88, vacant: 68, revenue: 140000 },
  { month: 'May', occupancy: 78, vacant: 79, revenue: 125000 },
  { month: 'Jun', occupancy: 78, vacant: 72, revenue: 125000 },
  { month: 'Jul', occupancy: 79, vacant: 76, revenue: 126000 },
  { month: 'Aug', occupancy: 78, vacant: 73, revenue: 125000 },
  { month: 'Sep', occupancy: 45, vacant: 72, revenue: 72000 },
  { month: 'Oct', occupancy: 45, vacant: 90, revenue: 72000 },
  { month: 'Nov', occupancy: 35, vacant: 90, revenue: 56000 },
  { month: 'Dec', occupancy: 25, vacant: 100, revenue: 40000 },
];

const moveInOutData = [
  { month: 'Jan', moveIns: 12, moveOuts: 8 },
  { month: 'Feb', moveIns: 15, moveOuts: 10 },
  { month: 'Mar', moveIns: 18, moveOuts: 12 },
  { month: 'Apr', moveIns: 14, moveOuts: 9 },
  { month: 'May', moveIns: 16, moveOuts: 11 },
  { month: 'Jun', moveIns: 13, moveOuts: 8 },
];

const unitTypeData = [
  { type: 'S', total: 65, vacant: 45 },
  { type: 'M', total: 50, vacant: 30 },
  { type: 'L', total: 60, vacant: 15 },
  { type: 'XL', total: 70, vacant: 25 },
];

const securityEventsData = [
  { month: 'Jan', events: 3, critical: 0 },
  { month: 'Feb', events: 2, critical: 0 },
  { month: 'Mar', events: 5, critical: 1 },
  { month: 'Apr', events: 4, critical: 0 },
  { month: 'May', events: 6, critical: 1 },
  { month: 'Jun', events: 3, critical: 0 },
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

export const FullReportView: React.FC<FullReportViewProps> = ({
  isOpen,
  onClose,
  title,
  reportType,
}) => {
  if (!isOpen) return null;

  const renderContent = () => {
    switch (reportType) {
      case 'occupancy':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Total Units</div>
                <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">200</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Occupied</div>
                <div className="text-3xl font-bold text-green-900 dark:text-green-100">165</div>
                <div className="text-xs text-green-700 dark:text-green-300 mt-1">82.5%</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">Vacant</div>
                <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">35</div>
                <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">17.5%</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                12-Month Occupancy & Revenue Trend
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={occupancyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                    <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" />
                    <YAxis yAxisId="left" stroke="#6b7280" className="dark:stroke-gray-400" label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#6b7280" className="dark:stroke-gray-400" label={{ value: 'Revenue ($)', angle: 90, position: 'insideRight' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                    }}
                  />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                    <Area yAxisId="right" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Move-ins vs Move-outs (Last 6 Months)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={moveInOutData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                      <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" />
                      <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                    }}
                  />
                      <Legend />
                      <Bar dataKey="moveIns" name="Move-ins" fill="#3b82f6" />
                      <Bar dataKey="moveOuts" name="Move-outs" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Unit Type Distribution
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={unitTypeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                      <XAxis dataKey="type" stroke="#6b7280" className="dark:stroke-gray-400" />
                      <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                    }}
                  />
                      <Legend />
                      <Bar dataKey="total" name="Total Units" fill="#3b82f6" />
                      <Bar dataKey="vacant" name="Vacant" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                <div className="text-sm text-red-600 dark:text-red-400 mb-1">Total Events</div>
                <div className="text-3xl font-bold text-red-900 dark:text-red-100">23</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">Critical</div>
                <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">2</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Resolved</div>
                <div className="text-3xl font-bold text-green-900 dark:text-green-100">21</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Security Events Trend (Last 6 Months)
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={securityEventsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                    <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" />
                    <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                    }}
                  />
                    <Legend />
                    <Bar dataKey="events" name="Total Events" fill="#3b82f6" />
                    <Bar dataKey="critical" name="Critical" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case 'maintenance':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Open</div>
                <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">5</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Completed</div>
                <div className="text-3xl font-bold text-green-900 dark:text-green-100">75</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">Overdue</div>
                <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">1</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Maintenance Work Orders (Last 6 Months)
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={maintenanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                    <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" />
                    <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                    }}
                  />
                    <Legend />
                    <Bar dataKey="open" name="Open" fill="#3b82f6" />
                    <Bar dataKey="completed" name="Completed" fill="#10b981" />
                    <Bar dataKey="overdue" name="Overdue" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case 'payments':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Collection Rate</div>
                <div className="text-3xl font-bold text-green-900 dark:text-green-100">95%</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Collected</div>
                <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">$125k</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">Outstanding</div>
                <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">$12k</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Payment Collection Trend (Last 6 Months)
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={paymentsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                    <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" />
                    <YAxis yAxisId="left" stroke="#6b7280" className="dark:stroke-gray-400" label={{ value: 'Collection %', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#6b7280" className="dark:stroke-gray-400" label={{ value: 'Amount ($)', angle: 90, position: 'insideRight' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                    }}
                  />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="collected" name="Collection %" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                    <Area yAxisId="right" type="monotone" dataKey="amount" name="Amount ($)" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Slide-in Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full max-w-4xl bg-white dark:bg-gray-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <XMarkIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
};


