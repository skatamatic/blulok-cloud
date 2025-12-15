import React, { useState, useRef, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { pestTreatmentCosts } from './reportData';
import { VideoPlayer } from './VideoPlayer';
// @ts-ignore - html2pdf.js doesn't have TypeScript definitions
import html2pdf from 'html2pdf.js';

const tabClass = (selected: boolean) =>
  selected
    ? 'px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
    : 'px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-b-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600';

interface PestResponseTabsProps {
  title?: string;
  reportRef?: React.RefObject<HTMLDivElement>;
}

export const PestResponseTabs: React.FC<PestResponseTabsProps> = ({ title = 'Pest Response Report', reportRef }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const tabRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  const tabs = ['Workflow', 'Vendor Details', 'Cost Analysis', 'Prevention'];

  // Export all tabs to PDF
  useEffect(() => {
    if (reportRef?.current) {
      (reportRef.current as any).exportAllTabs = async () => {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
        
        const originalIndex = selectedIndex;
        
        for (let i = 0; i < tabs.length; i++) {
          const tabElement = tabRefs[i].current;
          if (!tabElement) continue;

          setSelectedIndex(i);
          await new Promise(resolve => setTimeout(resolve, 300));

          const canvas = await html2canvas(tabElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          });

          if (i > 0) pdf.addPage();
          
          const imgWidth = 8;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const imgData = canvas.toDataURL('image/jpeg', 0.98);
          pdf.addImage(imgData, 'JPEG', 0.5, 0.5, imgWidth, Math.min(imgHeight, 10));
        }

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

  const workflowSteps = [
    { step: 1, time: '3:00 PM', action: 'Work Order Created', status: 'completed', duration: '0 min' },
    { step: 2, time: '3:05 PM', action: 'Tenant Notified', status: 'completed', duration: '5 min' },
    { step: 3, time: '3:15 PM', action: 'Vendor Contacted', status: 'completed', duration: '15 min' },
    { step: 4, time: '3:20 PM', action: 'Access Window Created', status: 'completed', duration: '20 min' },
    { step: 5, time: '3:30 PM', action: 'Contractor Arrived', status: 'completed', duration: '30 min' },
    { step: 6, time: '3:47 PM', action: 'Treatment Completed', status: 'completed', duration: '47 min' },
    { step: 7, time: '3:48 PM', action: 'Work Order Closed', status: 'completed', duration: '48 min' },
  ];

  const vendorData = [
    { vendor: 'Pest Control Pro', responseTime: 2.5, completionRate: 98, avgCost: 150, totalJobs: 45, rating: 4.8 },
    { vendor: 'Quick Pest Solutions', responseTime: 3.2, completionRate: 95, avgCost: 175, totalJobs: 32, rating: 4.6 },
    { vendor: 'Eco Pest Management', responseTime: 1.8, completionRate: 100, avgCost: 200, totalJobs: 28, rating: 4.9 },
  ];

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
            {/* Workflow Tab */}
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
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Work Order</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">#237</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Completed</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Response Time</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">30 min</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Same day</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Completion Time</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">48 min</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total duration</div>
                    </div>
                  </div>

                  {/* Inspection Video Section */}
                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Inspection Video</h3>
                    <div className="rounded-lg overflow-hidden">
                      <VideoPlayer videoUrl="/demo-videos/security_incident_demo2.mp4" className="w-full h-80" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Pest inspection and treatment footage from Unit 10</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Workflow Timeline</h3>
                    <div className="space-y-2">
                      {workflowSteps.map((item) => (
                        <div key={item.step} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 dark:bg-green-400 text-white flex items-center justify-center font-semibold text-xs">
                            ✓
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-white text-sm">{item.action}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.time} • Duration: {item.duration}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Workflow Duration Metrics</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={workflowSteps.map(s => ({ step: `Step ${s.step}`, duration: parseInt(s.duration) }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                          <XAxis dataKey="step" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                          <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Duration (min)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
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
                          <Bar dataKey="duration" name="Duration (min)" fill="#10b981" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Vendor Details Tab */}
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
                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Vendor Performance Metrics</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={vendorData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
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

                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Vendor Contact Information</h3>
                    <div className="space-y-3">
                      {vendorData.map((vendor, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-sm text-gray-900 dark:text-white">{vendor.vendor}</h4>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Rating: {vendor.rating}/5.0 • {vendor.totalJobs} total jobs
                              </div>
                            </div>
                            <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs font-medium">
                              Active
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-4 mt-3 text-xs">
                            <div>
                              <div className="text-gray-500 dark:text-gray-400">Response Time</div>
                              <div className="font-medium text-gray-900 dark:text-white">{vendor.responseTime} hrs</div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400">Completion Rate</div>
                              <div className="font-medium text-gray-900 dark:text-white">{vendor.completionRate}%</div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400">Avg Cost</div>
                              <div className="font-medium text-gray-900 dark:text-white">${vendor.avgCost}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Cost Analysis Tab */}
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
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Total Cost</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">$2,530</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Last 6 months</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Avg per Treatment</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">$158</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">16 treatments</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">ROI</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">+142%</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Prevention value</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Treatment Cost Trends</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={pestTreatmentCosts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05}/>
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
                            <Area type="monotone" dataKey="cost" name="Cost ($)" stroke="#f59e0b" strokeWidth={3} fill="url(#costGradient)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Cost vs Units Treated</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={pestTreatmentCosts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                            <Bar yAxisId="left" dataKey="cost" name="Cost ($)" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                            <Bar yAxisId="right" dataKey="units" name="Units Treated" fill="#10b981" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Prevention Tab */}
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
                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Prevention Recommendations</h3>
                    <div className="space-y-4">
                      {[
                        { priority: 'High', title: 'Seal entry points in Zone A', description: 'Inspect and seal all potential entry points including gaps around doors, windows, and utility penetrations. Focus on units 207, 189, and 203.', action: 'Schedule inspection' },
                        { priority: 'Medium', title: 'Implement regular cleaning schedule', description: 'Increase cleaning frequency in high-risk areas. Ensure proper waste management and eliminate food sources.', action: 'Update cleaning schedule' },
                        { priority: 'Low', title: 'Install monitoring traps', description: 'Place monitoring traps in strategic locations to detect early signs of pest activity before infestations occur.', action: 'Order traps' },
                      ].map((rec, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                rec.priority === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                rec.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              }`}>
                                {rec.priority}
                              </span>
                              <h4 className="font-semibold text-sm text-gray-900 dark:text-white">{rec.title}</h4>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{rec.description}</p>
                          <button className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
                            {rec.action} →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Unit Risk Assessment</h3>
                      <div className="space-y-2">
                        {[
                          { unit: '207', risk: 'High', lastInspection: '2024-01-10', nextInspection: '2024-01-25' },
                          { unit: '189', risk: 'Medium', lastInspection: '2024-01-12', nextInspection: '2024-01-27' },
                          { unit: '203', risk: 'High', lastInspection: '2024-01-08', nextInspection: '2024-01-23' },
                          { unit: '195', risk: 'Low', lastInspection: '2024-01-15', nextInspection: '2024-02-01' },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">Unit {item.unit}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Last: {item.lastInspection} • Next: {item.nextInspection}</div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.risk === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                              item.risk === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            }`}>
                              {item.risk}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Maintenance Schedule Suggestions</h3>
                      <div className="space-y-2">
                        {[
                          { date: '2024-01-20', task: 'Quarterly pest inspection', type: 'Inspection' },
                          { date: '2024-01-25', task: 'Seal entry points - Zone A', type: 'Maintenance' },
                          { date: '2024-02-01', task: 'Install monitoring traps', type: 'Installation' },
                        ].map((item, idx) => (
                          <div key={idx} className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{item.task}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.date} • {item.type}</div>
                          </div>
                        ))}
                      </div>
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

