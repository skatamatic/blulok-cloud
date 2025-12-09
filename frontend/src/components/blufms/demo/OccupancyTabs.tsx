import React, { useState, useRef, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart, Line } from 'recharts';
import { occupancyData, unitTypeData } from './reportData';
// @ts-ignore - html2pdf.js doesn't have TypeScript definitions
import html2pdf from 'html2pdf.js';

const tabClass = (selected: boolean) =>
  selected
    ? 'px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
    : 'px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-b-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600';

interface OccupancyTabsProps {
  title?: string;
  reportRef?: React.RefObject<HTMLDivElement>;
}

export const OccupancyTabs: React.FC<OccupancyTabsProps> = ({ title = 'Occupancy Report', reportRef }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const tabRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  const tabs = ['Overview', 'Trends', 'Forecasts', 'Unit Details'];

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

  const vacantUnitsList = [
    { unit: '207', type: 'Small (5x5)', daysVacant: 45, lastTenant: 'John Smith', revenueLoss: 225 },
    { unit: '189', type: 'Medium (10x10)', daysVacant: 32, lastTenant: 'Sarah Johnson', revenueLoss: 320 },
    { unit: '203', type: 'Large (10x20)', daysVacant: 28, lastTenant: 'Mike Davis', revenueLoss: 420 },
    { unit: '195', type: 'XL (10x30)', daysVacant: 15, lastTenant: 'Emily Wilson', revenueLoss: 375 },
    { unit: '178', type: 'Medium (10x10)', daysVacant: 60, lastTenant: 'Robert Brown', revenueLoss: 600 },
  ];

  const forecastData = [
    ...occupancyData.slice(-6),
    { month: '+1', occupancy: 87, lowerBound: 82, upperBound: 92 },
    { month: '+2', occupancy: 89, lowerBound: 84, upperBound: 94 },
    { month: '+3', occupancy: 91, lowerBound: 86, upperBound: 96 },
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
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={occupancyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="occupancyGradient4" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                              </linearGradient>
                              <linearGradient id="revenueGradient3" x1="0" y1="0" x2="0" y2="1">
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
                            <Area yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="#3b82f6" strokeWidth={3} fill="url(#occupancyGradient4)" />
                            <Area yAxisId="right" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#10b981" strokeWidth={3} fill="url(#revenueGradient3)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
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
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Trends Tab */}
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
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Occupancy vs Revenue Correlation</h3>
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
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Vacancy Duration Analysis</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={vacantUnitsList} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                          <XAxis dataKey="unit" stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} />
                          <YAxis stroke="#6b7280" className="dark:stroke-gray-400" tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Days Vacant', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} />
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
                          <Bar dataKey="daysVacant" name="Days Vacant" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Forecasts Tab */}
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
                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-purple-500 dark:border-l-purple-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">AI Forecast with Confidence Intervals</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={forecastData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="forecastGradient2" x1="0" y1="0" x2="0" y2="1">
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
                          <Area type="monotone" dataKey="occupancy" name="Forecast" stroke="#8b5cf6" strokeWidth={3} fill="url(#forecastGradient2)" />
                          <Area type="monotone" dataKey="lowerBound" name="Lower Bound" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="5 5" fill="transparent" />
                          <Area type="monotone" dataKey="upperBound" name="Upper Bound" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="5 5" fill="transparent" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-blue-500 dark:border-l-blue-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Multiple Scenario Projections</h3>
                      <div className="space-y-3">
                        {[
                          { scenario: 'Optimistic', occupancy: 95, revenue: 152000, probability: '25%' },
                          { scenario: 'Realistic', occupancy: 88, revenue: 140000, probability: '50%' },
                          { scenario: 'Conservative', occupancy: 82, revenue: 131000, probability: '25%' },
                        ].map((item, idx) => (
                          <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-sm text-gray-900 dark:text-white">{item.scenario}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{item.probability}</span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              Occupancy: {item.occupancy}% • Revenue: ${item.revenue.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Market Comparison Data</h3>
                      <div className="space-y-3">
                        {[
                          { metric: 'Market Average', value: '85%', trend: '+2%' },
                          { metric: 'Competitor A', value: '88%', trend: '+1%' },
                          { metric: 'Competitor B', value: '82%', trend: '-1%' },
                          { metric: 'Our Facility', value: '82.5%', trend: '+5%' },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                            <span className="text-sm text-gray-900 dark:text-white">{item.metric}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</span>
                              <span className={`text-xs font-medium ${item.trend.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {item.trend}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tab.Panel>

            {/* Unit Details Tab */}
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
                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-orange-500 dark:border-l-orange-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Vacant Units List</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit #</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Days Vacant</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Tenant</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Revenue Loss</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {vacantUnitsList.map((unit, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{unit.unit}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{unit.type}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{unit.daysVacant} days</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{unit.lastTenant}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-red-600 dark:text-red-400">${unit.revenueLoss}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded border-l-2 border-l-green-500 dark:border-l-green-400 border-r border-t border-b border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Unit Type Performance Comparison</h3>
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
              </motion.div>
            </Tab.Panel>
          </AnimatePresence>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
};


