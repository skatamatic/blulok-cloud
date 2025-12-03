import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PresentationChartLineIcon, MapIcon } from '@heroicons/react/24/outline';

export default function BluFMSDashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-2">
            <PresentationChartLineIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              BluFMS Dashboard
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Facility Management System dashboard (Demo Mode)
          </p>
        </div>

        {/* Quick Actions Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Facility Map Card */}
          <button
            onClick={() => navigate('/blufms/facility-map')}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-200 text-left group"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-primary-100 dark:bg-primary-900/20 rounded-lg flex items-center justify-center group-hover:bg-primary-200 dark:group-hover:bg-primary-900/40 transition-colors duration-200">
                  <MapIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Facility Map
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  View interactive facility maps and visualizations
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Placeholder Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
          <div className="text-center">
            <PresentationChartLineIcon className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              BluFMS Dashboard
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              This is a placeholder view for the BluFMS dashboard. Content will be added here for demonstration purposes.
            </p>
            <div className="inline-flex items-center px-4 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Demo Mode - Placeholder Content
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

