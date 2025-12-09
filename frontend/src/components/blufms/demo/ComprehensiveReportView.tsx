import React, { useRef } from 'react';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore - html2pdf.js doesn't have TypeScript definitions
import html2pdf from 'html2pdf.js';
import { MorningReportTabs } from './MorningReportTabs';
import { SecurityIncidentTabs } from './SecurityIncidentTabs';
import { PestResponseTabs } from './PestResponseTabs';
import { OccupancyTabs } from './OccupancyTabs';

interface ComprehensiveReportViewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  reportType: 'morning-report' | 'security-incident' | 'pest-response' | 'occupancy';
  facilityName?: string;
}


export const ComprehensiveReportView: React.FC<ComprehensiveReportViewProps> = ({
  isOpen,
  onClose,
  title,
  reportType,
  facilityName = 'Denver Facility',
}) => {
  const reportRef = useRef<HTMLDivElement>(null);

  const handleExportPDF = async () => {
    if (!reportRef.current) return;

    // For tabbed reports, export all tabs as separate pages
    const tabbedReports = ['morning-report', 'security-incident', 'pest-response', 'occupancy'];
    if (tabbedReports.includes(reportType)) {
      const exportFn = (reportRef.current as any).exportAllTabs;
      if (exportFn) {
        await exportFn();
        return;
      }
    }

    // Fallback: export single page
    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number],
      filename: `${title.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const },
    };

    html2pdf().set(opt).from(reportRef.current).save();
  };

  const renderMorningReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8 overflow-x-hidden">
      <MorningReportTabs title={title} reportRef={reportRef} />
    </div>
  );

  const renderSecurityReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8 overflow-x-hidden">
      <SecurityIncidentTabs title={title} reportRef={reportRef} />
    </div>
  );

  const renderOccupancyReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8 overflow-x-hidden">
      <OccupancyTabs title={title} reportRef={reportRef} />
    </div>
  );

  const renderPestResponseReport = () => (
    <div ref={reportRef} className="space-y-8 bg-white dark:bg-gray-900 p-8 overflow-x-hidden">
      <PestResponseTabs title={title} reportRef={reportRef} />
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with fade animation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          
          {/* Panel with slide and fade animation */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ 
              duration: 0.35, 
              ease: [0.4, 0, 0.2, 1],
              opacity: { duration: 0.3 }
            }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-5xl bg-gray-50 dark:bg-gray-900 shadow-2xl z-50"
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{facilityName} • {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
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

              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {renderContent()}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

