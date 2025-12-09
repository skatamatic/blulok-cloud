import React, { useState, useRef, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { securityEventsData, securityEventBreakdown, zoneActivityData } from './reportData';
import { VideoPlayer } from './VideoPlayer';
// @ts-ignore - html2pdf.js doesn't have TypeScript definitions
import html2pdf from 'html2pdf.js';

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

const tabClass = (selected: boolean) =>
  selected
    ? 'px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
    : 'px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-b-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600';

interface SecurityIncidentTabsProps {
  title?: string;
  reportRef?: React.RefObject<HTMLDivElement>;
}

export const SecurityIncidentTabs: React.FC<SecurityIncidentTabsProps> = ({ title = 'Security Incident Report', reportRef }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const tabRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  const tabs = ['Event Details', 'Timeline Analysis', 'Impact Assessment', 'Recommendations'];

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
            {/* Event Details Tab */}
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
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-red-500 dark:border-l-red-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Total Events</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">23</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Last 30 days</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Critical</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">2</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Requires attention</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Resolved</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">21</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">91.3% resolution rate</div>
                    </div>
                  </div>

                  {/* Video Evidence Section */}
                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-red-500 dark:border-l-red-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Video Evidence</h3>
                    <div className="rounded-lg overflow-hidden">
                      <VideoPlayer videoUrl="/demo-videos/security_incident_demo1.mp4" className="w-full h-80" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Security camera footage from Unit 402 - Zone C at 11:46 PM</p>
                  </div>

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
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Timeline Analysis Tab */}
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
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Detailed Timeline Visualization</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={securityEventsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                          <Line type="monotone" dataKey="total" name="Total Events" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} />
                          <Line type="monotone" dataKey="critical" name="Critical Events" stroke="#ef4444" strokeWidth={3} dot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Sensor Trigger Correlation</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Motion Sensor', value: 45 },
                                { name: 'Door Access', value: 30 },
                                { name: 'Lock Scan', value: 15 },
                                { name: 'Other', value: 10 },
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
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Lock Scan Results by Zone</h3>
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
                            <Bar dataKey="events" name="Total Scans" fill="#10b981" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Impact Assessment Tab */}
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
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-red-500 dark:border-l-red-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Affected Units</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">8</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Units impacted</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Risk Score</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">7.2</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Moderate risk</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Response Time</div>
                      <div className="text-3xl font-semibold text-gray-900 dark:text-white">12 min</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Average</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Resolution Time Analysis</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={zoneActivityData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                          <XAxis dataKey="zone" stroke="#6b7280" className="dark:stroke-gray-400" angle={-45} textAnchor="end" height={60} tick={{ fill: '#6b7280', fontSize: 10 }} />
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

                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Similar Historical Incidents</h3>
                    <div className="space-y-3">
                      {[
                        { date: '2024-01-10', type: 'Motion Sensor', zone: 'Zone C', resolution: '15 min', similarity: '92%' },
                        { date: '2023-12-28', type: 'Door Access', zone: 'Zone A', resolution: '8 min', similarity: '85%' },
                        { date: '2023-12-15', type: 'Motion Sensor', zone: 'Zone B', resolution: '22 min', similarity: '78%' },
                      ].map((incident, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                          <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-white">{incident.type} - {incident.zone}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{incident.date} • Resolved in {incident.resolution}</div>
                          </div>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded text-xs font-medium">
                            {incident.similarity} match
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Recommendations Tab */}
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
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">AI-Generated Recommendations</h3>
                    <div className="space-y-4">
                      {[
                        { priority: 'High', title: 'Increase sensor density in Zone C', description: 'Zone C shows 15 events in the last month. Consider adding additional motion sensors to improve coverage and reduce false positives.', action: 'Schedule maintenance review' },
                        { priority: 'Medium', title: 'Review access patterns for Zone A', description: 'Unusual access patterns detected. Review tenant access logs and consider implementing additional verification steps.', action: 'Review access logs' },
                        { priority: 'Low', title: 'Update lock scan frequency', description: 'Current lock scan frequency is adequate. Consider increasing frequency during peak hours for better security coverage.', action: 'Update scan schedule' },
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
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Action Items</h3>
                      <div className="space-y-2">
                        {[
                          { task: 'Review Zone C sensor configuration', due: '2024-01-20', status: 'Pending' },
                          { task: 'Update access control policies', due: '2024-01-18', status: 'In Progress' },
                          { task: 'Schedule security audit', due: '2024-01-25', status: 'Scheduled' },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">{item.task}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Due: {item.due}</div>
                            </div>
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Follow-up Schedule</h3>
                      <div className="space-y-2">
                        {[
                          { date: '2024-01-18', event: 'Security team review meeting', type: 'Meeting' },
                          { date: '2024-01-22', event: 'Sensor maintenance check', type: 'Maintenance' },
                          { date: '2024-01-25', event: 'Quarterly security audit', type: 'Audit' },
                        ].map((item, idx) => (
                          <div key={idx} className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{item.event}</div>
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

