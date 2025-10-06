import React, { useState } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';

interface TestScrollWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

export const TestScrollWidget: React.FC<TestScrollWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  availableSizes = ['medium', 'medium-tall', 'large', 'huge', 'large-wide', 'huge-wide'],
  onGridSizeChange,
  onRemove,
}) => {
  const [size, setSize] = useState<WidgetSize>(initialSize);
  // Generate test content that will definitely overflow
  const testItems = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    title: `Test Item ${i + 1}`,
    description: `This is a longer description for test item ${i + 1} to demonstrate scrolling functionality.`,
    status: i % 3 === 0 ? 'success' : i % 3 === 1 ? 'warning' : 'info',
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <Widget 
      id={id} 
      title={title} 
      size={size}
      availableSizes={availableSizes}
      onSizeChange={setSize}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      className="group"
    >
      <div className="h-full flex flex-col">
        <div className="mb-4 flex-shrink-0">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This widget demonstrates scrolling when content overflows. Try resizing it using the menu to see different behaviors.
          </p>
        </div>
        
        <div className="flex-1 space-y-3 min-h-0">
          {testItems.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {item.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {item.description}
                  </p>
                </div>
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(item.status)}`}>
                  {item.status}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Widget>
  );
};
