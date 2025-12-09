import React, { useState, useRef, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts';
import { occupancyData, unitTypeData, paymentsData, securityEventsData, maintenanceData, securityEventBreakdown, workOrderList, failedPayments, vendorPerformance, zoneActivityData } from './reportData';
// @ts-ignore - html2pdf.js doesn't have TypeScript definitions
import html2pdf from 'html2pdf.js';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const tabClass = (selected: boolean) =>
  selected
    ? 'px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
    : 'px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-b-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600';

interface MorningReportTabsProps {
  title?: string;
  reportRef?: React.RefObject<HTMLDivElement>;
}

export const MorningReportTabs: React.FC<MorningReportTabsProps> = ({ title = 'Morning Shift Report', reportRef }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const tabRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  const tabs = ['Overview', 'Security', 'Maintenance', 'Payments', 'Occupancy Trends'];

  // Export all tabs to PDF
  useEffect(() => {
    if (reportRef?.current) {
      // Expose export function to parent
      (reportRef.current as any).exportAllTabs = async () => {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
        
        const originalIndex = selectedIndex;
        
        for (let i = 0; i < tabs.length; i++) {
          const tabElement = tabRefs[i].current;
          if (!tabElement) continue;

          // Set tab to visible temporarily
          setSelectedIndex(i);
          await new Promise(resolve => setTimeout(resolve, 300)); // Wait for render and animation

          const canvas = await html2canvas(tabElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          });

          if (i > 0) pdf.addPage();
          
          const imgWidth = 8; // Letter width minus margins (0.5 + 0.5)
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const imgData = canvas.toDataURL('image/jpeg', 0.98);
          pdf.addImage(imgData, 'JPEG', 0.5, 0.5, imgWidth, Math.min(imgHeight, 10)); // Max height 10 inches
        }

        // Restore original tab
        setSelectedIndex(originalIndex);
        
        pdf.save(`${title.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
      };
    }
  }, [reportRef, title, tabs, selectedIndex]);

  const handleTabChange = (index: number) => {
    setDirection(index > selectedIndex ? 1 : -1);
    setSelectedIndex(index);
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -100 : 100,
      opacity: 0,
    }),
  };

  return (
    <div className="overflow-x-hidden">
      <Tab.Group selectedIndex={selectedIndex} onChange={handleTabChange}>
        <Tab.List className="flex space-x-1 border-b border-gray-200 dark:border-gray-700 mb-6">
          {tabs.map((tab) => (
            <Tab key={tab} className={({ selected }) => tabClass(selected)}>
              {tab}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels>
          <AnimatePresence mode="wait" custom={direction}>
            {/* Overview Tab */}
            <Tab.Panel key={0} className="space-y-6">
              <motion.div
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <div ref={tabRefs[0]} className="space-y-6">
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

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Key Metrics Dashboard</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={occupancyData.slice(-6)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                    <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis yAxisId="left" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
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
                    <Bar yAxisId="left" dataKey="moveIns" name="Move-ins" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    <Bar yAxisId="left" dataKey="moveOuts" name="Move-outs" fill="#ef4444" radius={[8, 8, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#10b981" strokeWidth={3} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
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
          </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Security Tab */}
            <Tab.Panel key={1} className="space-y-6">
              <motion.div
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <div ref={tabRefs[1]} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Security Events Timeline</h3>
                        <div className="h-64">
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

            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-red-500 dark:border-l-red-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Zone Activity Heatmap</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={zoneActivityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                    <XAxis dataKey="zone" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
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
                    <Bar dataKey="events" name="Total Events" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="critical" name="Critical" fill="#ef4444" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Security Event Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Severity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Zone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resolution Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {securityEventBreakdown.map((event, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">{event.date}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{event.type}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          event.severity === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          event.severity === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        }`}>
                          {event.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{event.zone}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{event.resolutionTime}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs font-medium">
                          {event.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Resolution Time Analysis</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneActivityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                  <XAxis dataKey="zone" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Avg Resolution (min)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
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
                  <Bar dataKey="avgResolution" name="Avg Resolution (min)" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Maintenance Tab */}
            <Tab.Panel key={2} className="space-y-6">
              <motion.div
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <div ref={tabRefs[2]} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-yellow-500 dark:border-l-yellow-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Work Order Status</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed', value: 12 },
                        { name: 'In Progress', value: 1 },
                        { name: 'Overdue', value: 1 },
                        { name: 'Scheduled', value: 1 },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[COLORS[0], COLORS[1], COLORS[2], COLORS[3]].map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Maintenance Cost Trends</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={maintenanceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="maintenanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
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
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={3} fill="url(#maintenanceGradient)" />
                    <Area type="monotone" dataKey="open" name="Open" stroke="#f59e0b" strokeWidth={3} fill="url(#maintenanceGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-yellow-500 dark:border-l-yellow-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Work Order List</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Issue</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assigned</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Due Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {workOrderList.map((wo) => (
                    <tr key={wo.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{wo.id}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{wo.unit}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{wo.issue}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          wo.priority === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          wo.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        }`}>
                          {wo.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          wo.status === 'Overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          wo.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                          wo.status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}>
                          {wo.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{wo.assigned}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{wo.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Vendor Performance Metrics</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vendorPerformance} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                  <XAxis dataKey="vendor" stroke="#6b7280" className="dark:stroke-gray-400" angle={-45} textAnchor="end" height={60} tick={{ fill: '#6b7280', fontSize: 10 }} />
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
                  <Bar dataKey="completionRate" name="Completion Rate %" fill="#10b981" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="responseTime" name="Response Time (hrs)" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Payments Tab */}
            <Tab.Panel key={3} className="space-y-6">
              <motion.div
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <div ref={tabRefs[3]} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Payment Collection Funnel</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                    <Bar dataKey="collected" name="Collected %" fill="#10b981" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="outstanding" name="Outstanding %" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Payment Method Breakdown</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Online', value: 85 },
                        { name: 'On-site', value: 15 },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#10b981" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-red-500 dark:border-l-red-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Failed Payment Details</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tenant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {failedPayments.map((payment, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">{payment.tenant}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{payment.unit}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${payment.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{payment.method}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{payment.reason}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{payment.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Outstanding Balance Trends</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={paymentsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="outstandingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                  <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Outstanding %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
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
                  <Area type="monotone" dataKey="outstanding" name="Outstanding %" stroke="#f59e0b" strokeWidth={3} fill="url(#outstandingGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Occupancy Trends Tab */}
            <Tab.Panel key={4} className="space-y-6">
              <motion.div
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <div ref={tabRefs[4]} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Occupancy, Revenue & Vacancy Correlation</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={occupancyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                    <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis yAxisId="left" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
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
                    <Bar yAxisId="left" dataKey="vacant" name="Vacant Units" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="#3b82f6" strokeWidth={3} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#10b981" strokeWidth={3} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Unit Type Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unitTypeData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                    <XAxis dataKey="type" stroke="#6b7280" className="dark:stroke-gray-400" angle={-45} textAnchor="end" height={60} tick={{ fill: '#6b7280', fontSize: 10 }} />
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
          </div>

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Move-in/Move-out Patterns</h3>
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

          <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-indigo-500 dark:border-l-indigo-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">AI Forecast with Confidence Intervals</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[
                  ...occupancyData.slice(-3),
                  { month: 'Forecast', occupancy: 85, lowerBound: 80, upperBound: 90 },
                  { month: '+1', occupancy: 87, lowerBound: 82, upperBound: 92 },
                  { month: '+2', occupancy: 89, lowerBound: 84, upperBound: 94 },
                ]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
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
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Area type="monotone" dataKey="occupancy" name="Forecast" stroke="#8b5cf6" strokeWidth={3} fill="url(#forecastGradient)" />
                  <Area type="monotone" dataKey="lowerBound" name="Lower Bound" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="5 5" fill="transparent" />
                  <Area type="monotone" dataKey="upperBound" name="Upper Bound" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="5 5" fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
                </div>
              </motion.div>
            </Tab.Panel>
          </AnimatePresence>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
};

