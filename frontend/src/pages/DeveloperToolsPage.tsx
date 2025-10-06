import { useState, useEffect, useRef, useMemo } from 'react';
import { websocketService } from '@/services/websocket.service';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocketDebug } from '@/contexts/WebSocketDebugContext';
import {
  CodeBracketIcon,
  CircleStackIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  WifiIcon,
  SignalIcon,
  ArrowDownTrayIcon,
  PaintBrushIcon,
  CloudIcon
} from '@heroicons/react/24/outline';

interface OperationStatus {
  type: 'success' | 'error' | 'loading' | 'idle';
  message: string;
}

interface LogEntryData {
  file: string;
  content: string;
  timestamp: string;
}

interface LogData {
  logs: LogEntryData[];
  totalFiles: number;
  linesRequested: number;
}

interface ConsoleLog {
  id: string;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  stack?: string;
  raw: string;
  parsed?: any;
}

interface WebSocketStats {
  totalClients: number;
  totalSubscriptions: number;
  subscriptionsByType: Record<string, number>;
  logWatchers: number;
}

interface DiagnosticsData {
  totalClients: number;
  totalSubscriptions: number;
  clientSubscriptions: any[];
  allSubscriptions: any[];
  logWatchers: Record<string, number>;
}

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';

const FMSToolsTab: React.FC = () => {
  const { addToast } = useToast();
  const [isSimulatedEnabled, setIsSimulatedEnabled] = useState(false);

  useEffect(() => {
    // Load current simulated provider setting from localStorage
    const enabled = localStorage.getItem('fms-simulated-enabled') === 'true';
    setIsSimulatedEnabled(enabled);
  }, []);

  const toggleSimulatedProvider = () => {
    const newState = !isSimulatedEnabled;
    setIsSimulatedEnabled(newState);
    localStorage.setItem('fms-simulated-enabled', newState.toString());

    addToast({
      type: 'success',
      title: 'FMS Settings Updated',
      message: `Simulated provider ${newState ? 'enabled' : 'disabled'}. Refresh FMS pages to see changes.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          FMS Development Tools
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure development and testing features for FMS integration.
        </p>
      </div>

      {/* Simulated Provider Toggle */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CloudIcon className="h-8 w-8 text-primary-500" />
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Simulated Provider
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enable the simulated FMS provider for testing and demos
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isSimulatedEnabled
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
            }`}>
              {isSimulatedEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              onClick={toggleSimulatedProvider}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                isSimulatedEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isSimulatedEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                What this does
              </h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-200">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Makes the "Simulated Provider" option available in FMS configuration</li>
                  <li>Allows testing FMS sync workflows without external APIs</li>
                  <li>Uses JSON files for mock data (perfect for demos)</li>
                  <li>Supports all FMS features: sync, change review, history</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Testing Instructions
        </h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              1. Enable Simulated Provider
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Toggle the switch above to enable the simulated provider.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              2. Configure FMS
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Go to any Facility Details page → FMS Integration tab → Select "Simulated Provider" → Save configuration.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              3. Test Sync
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Click "Sync Now" to trigger a sync operation. Review changes and apply them to test the full workflow.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              4. View Results
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Check Users and Units pages to see the synced data. View sync history in the FMS tab.
            </p>
          </div>
        </div>
      </div>

      {/* Data Files Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Mock Data Files
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The simulated provider reads JSON files from the backend's config directory:
        </p>
        <div className="space-y-2 font-mono text-sm">
          <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
            <span className="text-gray-900 dark:text-white">config/fms-simulated-data.json</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Default data</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
            <span className="text-gray-900 dark:text-white">config/fms-simulated-data.example-new-tenant.json</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">New tenant scenario</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
            <span className="text-gray-900 dark:text-white">config/fms-simulated-data.example-tenant-moved.json</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Tenant moved scenario</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Edit these files to test different scenarios. Changes are picked up immediately on next sync.
        </p>
      </div>
    </div>
  );
};

const UIDebugTab: React.FC = () => {
  const { addToast, clearAllToasts } = useToast();

  const testToast = (type: 'success' | 'info' | 'warning' | 'error' | 'critical') => {
    const messages = {
      success: {
        title: 'Success!',
        message: 'This is a success toast notification.',
      },
      info: {
        title: 'Information',
        message: 'This is an informational toast notification.',
      },
      warning: {
        title: 'Warning',
        message: 'This is a warning toast notification.',
      },
      error: {
        title: 'Error',
        message: 'This is an error toast notification.',
      },
      critical: {
        title: 'Critical Error',
        message: 'This is a critical error that requires manual dismissal.',
        persistent: true,
      },
    };

    addToast({
      type,
      ...messages[type],
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Toast Notification Testing</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Test different types of toast notifications. Critical errors never auto-dismiss and require manual dismissal.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => testToast('success')}
            className="flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200"
          >
            <CheckCircleIcon className="h-5 w-5 mr-2" />
            Test Success Toast
          </button>
          
          <button
            onClick={() => testToast('info')}
            className="flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
          >
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
            Test Info Toast
          </button>
          
          <button
            onClick={() => testToast('warning')}
            className="flex items-center justify-center px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors duration-200"
          >
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
            Test Warning Toast
          </button>
          
          <button
            onClick={() => testToast('error')}
            className="flex items-center justify-center px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
          >
            <XCircleIcon className="h-5 w-5 mr-2" />
            Test Error Toast
          </button>
          
          <button
            onClick={() => testToast('critical')}
            className="flex items-center justify-center px-4 py-3 bg-red-800 hover:bg-red-900 text-white rounded-lg transition-colors duration-200"
          >
            <XCircleIcon className="h-5 w-5 mr-2" />
            Test Critical Toast
          </button>
          
          <button
            onClick={clearAllToasts}
            className="flex items-center justify-center px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200"
          >
            <XCircleIcon className="h-5 w-5 mr-2" />
            Clear All Toasts
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Toast Features</h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-start space-x-2">
            <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Toasts stack up to 4 maximum in the bottom-right corner</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Auto-dismiss after 5 seconds (except critical errors)</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Critical errors require manual dismissal with X button</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Smooth animations for entrance and exit</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Progress bar shows remaining time for auto-dismiss toasts</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Fully responsive and theme-aware (light/dark mode)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function DeveloperToolsPage() {
  const [activeTab, setActiveTab] = useState<'database' | 'logs' | 'websocket' | 'ui-debug' | 'fms'>('database');
  const [seedStatus, setSeedStatus] = useState<OperationStatus>({ type: 'idle', message: '' });
  const [resetStatus, setResetStatus] = useState<OperationStatus>({ type: 'idle', message: '' });
  const { isDebugEnabled, toggleDebug } = useWebSocketDebug();
  
  // Log viewer state
  const [logData, setLogData] = useState<LogData | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<Set<string>>(new Set(['info', 'warn', 'error', 'debug']));
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set(['logs/combined.log', 'logs/error.log']));
  const [maxLines, setMaxLines] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const consoleRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(0);
  
  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStats, setWsStats] = useState<WebSocketStats | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [wsLoading, setWsLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Load logs when switching to logs tab for the first time
  useEffect(() => {
    if (activeTab === 'logs' && !logData) {
      fetchLogs();
    }
  }, [activeTab, logData]);

  // Auto-scroll to bottom when navigating to logs tab
  useEffect(() => {
    if (activeTab === 'logs' && consoleRef.current) {
      setTimeout(() => {
        if (consoleRef.current) {
          consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [activeTab]);

  // WebSocket connection and message handling
  useEffect(() => {
    const unsubscribeConnection = websocketService.onConnectionChange(setWsConnected);

    const unsubscribeLogs = websocketService.onMessage('logs', (data) => {
      console.log('📋 Logs: Received WebSocket log data:', data);
      if (data.logType && data.content) {
        console.log('📋 Logs: Parsing content:', data.content.substring(0, 200) + '...');
        const logEntries = parseMultilineLogs(data.content, data.logType);
        console.log('📋 Logs: Parsed entries:', logEntries.length);
        logEntries.forEach(addLogToConsole);
      }
    });

    const unsubscribeDiagnostics = websocketService.onMessage('diagnostics', setDiagnostics);

    setWsConnected(websocketService.isWebSocketConnected());

    return () => {
      unsubscribeConnection();
      unsubscribeLogs();
      unsubscribeDiagnostics();
    };
  }, []);

  // Simple approach: Subscribe/unsubscribe based on activeTab
  useEffect(() => {
    if (activeTab === 'logs') {
      websocketService.subscribe('logs', { type: 'all' });
    } else {
      websocketService.unsubscribe('logs');
    }
    
    return () => {
      websocketService.unsubscribe('logs');
    };
  }, [activeTab]);

  // Auto-scroll when new logs arrive (if enabled)
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLogs, autoScroll]);
  
  const parseLogEntry = (rawLog: string, source: string): ConsoleLog | null => {
    if (!rawLog.trim()) {
      return null;
    }
    
    console.log('📋 Logs: Parsing log entry:', rawLog.substring(0, 100) + '...');
  
    const createLogObject = (parsed: any, raw: string): ConsoleLog => {
      const timestamp = parsed.timestamp || new Date().toISOString();
      const level = parsed.level || 'info';
      let message = parsed.message || '';
      let stack = parsed.stack;
      
      // If no message but we have other properties, try to construct a meaningful message
      if (!message && parsed.error) {
        message = parsed.error;
      }
      if (!message && parsed.err) {
        message = parsed.err;
      }
      if (!message && parsed.msg) {
        message = parsed.msg;
      }
      if (!message && parsed.text) {
        message = parsed.text;
      }
      
      // If still no message, try to extract from the raw log
      if (!message) {
        // Look for common error patterns
        const errorMatch = raw.match(/Error:\s*(.+?)(?:\n|$)/);
        if (errorMatch) {
          message = errorMatch[1].trim();
        } else {
          // Fallback to first line of raw log
          message = raw.split('\n')[0].trim();
        }
      }
      
      // Clean up the message - remove JSON artifacts
      if (typeof message === 'string') {
        // Remove common JSON artifacts
        message = message
          .replace(/^['"]|['"]$/g, '') // Remove surrounding quotes
          .replace(/\\n/g, '\n') // Convert \n to actual newlines
          .replace(/\\t/g, '\t') // Convert \t to actual tabs
          .replace(/\\"/g, '"') // Convert \" to "
          .replace(/\\'/g, "'") // Convert \' to '
          .trim();
      }
      
      const result = {
        id: `${source}-${logIdCounter.current++}`,
        timestamp,
        level,
        source,
        message,
        stack,
        raw,
        parsed,
      };
      
      console.log('📋 Logs: Parsed result:', { level: result.level, message: result.message.substring(0, 50) + '...', hasStack: !!result.stack });
      
      return result;
    };
  
    // Attempt 1: Parse as strict JSON
    try {
      const parsed = JSON.parse(rawLog);
      return createLogObject(parsed, rawLog);
    } catch (e) {
      // Attempt 2: Try to parse as a JavaScript Object Literal (like Winston's output)
      try {
        // More sophisticated transformation for Winston's output
        let json5Like = rawLog;
        
        // Handle Error objects with stack traces - improved regex patterns
        if (rawLog.includes('stack:') || rawLog.includes('Error:')) {
          // Try multiple patterns for different log formats
          const patterns = [
            // Pattern 1: { level: 'error', message: '...', stack: '...' }
            {
              level: /level:\s*['"]([^'"]+)['"]/,
              message: /message:\s*['"]([^'"]+)['"]/,
              timestamp: /timestamp:\s*['"]([^'"]+)['"]/,
              stack: /stack:\s*['"]([^'"]+)['"]/
            },
            // Pattern 2: level: 'error', message: '...', stack: '...'
            {
              level: /level:\s*['"]([^'"]+)['"]/,
              message: /message:\s*['"]([^'"]+)['"]/,
              timestamp: /timestamp:\s*['"]([^'"]+)['"]/,
              stack: /stack:\s*['"]([^'"]+)['"]/
            }
          ];
          
          for (const pattern of patterns) {
            const levelMatch = rawLog.match(pattern.level);
            const messageMatch = rawLog.match(pattern.message);
            const timestampMatch = rawLog.match(pattern.timestamp);
            const stackMatch = rawLog.match(pattern.stack);
            
            if (levelMatch && messageMatch) {
              const parsed = {
                level: levelMatch[1],
                message: messageMatch[1],
                timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
                stack: stackMatch ? stackMatch[1] : undefined
              };
              return createLogObject(parsed, rawLog);
            }
          }
        }
        
        // Standard transformation for other objects
        json5Like = rawLog
          // Add double quotes around keys: { key: 'value' } -> { "key": 'value' }
          .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
          // Replace single-quoted string values with double-quoted ones, but be careful with nested quotes
          .replace(/'([^']*)'/g, '"$1"');
        
        const parsed = JSON.parse(json5Like);
        return createLogObject(parsed, rawLog);
      } catch (e2) {
        // Attempt 3: Try to extract structured data using regex patterns
        try {
          const levelMatch = rawLog.match(/(?:level|Level):\s*['"]?(\w+)['"]?/i);
          const messageMatch = rawLog.match(/(?:message|Message|msg|Msg):\s*['"]([^'"]+)['"]/i);
          const timestampMatch = rawLog.match(/(?:timestamp|Timestamp|time|Time):\s*['"]([^'"]+)['"]/i);
          const stackMatch = rawLog.match(/(?:stack|Stack):\s*['"]([^'"]+)['"]/i);
          
          if (levelMatch || messageMatch) {
            const parsed = {
              level: levelMatch ? levelMatch[1].toLowerCase() : 'info',
              message: messageMatch ? messageMatch[1] : rawLog,
              timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
              stack: stackMatch ? stackMatch[1] : undefined
            };
            return createLogObject(parsed, rawLog);
          }
        } catch (e3) {
          // Ignore and fall through to plain text
        }
        
        // Fallback: Treat as plain text
        return {
          id: `${source}-${logIdCounter.current++}`,
          timestamp: new Date().toISOString(),
          level: 'info', // Default level
          source: source,
          message: rawLog, // Use the raw string as the message
          raw: rawLog,
          parsed: null
        };
      }
    }
  };

  const parseMultilineLogs = (content: string, source: string): ConsoleLog[] => {
    const entries: ConsoleLog[] = [];
    let startIndex = 0;

    while (startIndex < content.length) {
      const firstBrace = content.indexOf('{', startIndex);
      if (firstBrace === -1) break;

      let braceCount = 1;
      let endIndex = -1;

      for (let i = firstBrace + 1; i < content.length; i++) {
        const char = content[i];
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
        if (braceCount === 0) {
          endIndex = i;
          break;
        }
      }

      if (endIndex !== -1) {
        const jsonString = content.substring(firstBrace, endIndex + 1);
        const logEntry = parseLogEntry(jsonString, source);
        if (logEntry) {
          entries.push(logEntry);
        }
        startIndex = endIndex + 1;
      } else {
        // Unmatched brace, stop parsing
        break;
      }
    }
    return entries;
  };
  
  const addLogToConsole = (logEntry: ConsoleLog | null) => {
    if (!logEntry) return;
    
    setConsoleLogs(prev => {
      const newLogs = [...prev, logEntry];
      // Limit to the last 1000 logs to prevent memory issues
      return newLogs.slice(-1000);
    });
  };

  const fetchLogs = async () => {
    setLogLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/dev/logs?type=all&lines=${maxLines}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setLogData(data.data);
        
        const allLogs: ConsoleLog[] = [];
        data.data.logs.forEach((log: LogEntryData) => {
          const logEntries = parseMultilineLogs(log.content, log.file);
          allLogs.push(...logEntries);
        });
        
        allLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setConsoleLogs(allLogs);
      } else {
        console.error('Failed to fetch logs:', data.message);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLogLoading(false);
    }
  };

  const fetchWebSocketStats = async () => {
    setWsLoading(true);
    try {
      console.log('🔍 Fetching WebSocket stats...');
      const response = await fetch(`${API_BASE_URL}/api/v1/dev/websocket-stats`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      console.log('🔍 Response status:', response.status);
      const data = await response.json();
      console.log('🔍 Response data:', data);
      if (data.success) {
        setWsStats(data.data);
        console.log('✅ WebSocket stats loaded:', data.data);
      } else {
        console.error('❌ Failed to fetch WebSocket stats:', data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching WebSocket stats:', error);
    } finally {
      setWsLoading(false);
    }
  };

  const requestDiagnostics = () => {
    websocketService.requestDiagnostics();
  };

  const toggleLogExpansion = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const filteredLogs = useMemo(() => {
    return consoleLogs.filter(log => 
      logLevelFilter.has(log.level) && 
      sourceFilter.has(log.source) &&
      (searchFilter === '' || log.message.toLowerCase().includes(searchFilter.toLowerCase()))
    );
  }, [consoleLogs, logLevelFilter, sourceFilter, searchFilter]);

  const exportToCSV = () => {
    const csvContent = [
      'Timestamp,Level,Source,Message,Stack',
      ...filteredLogs.map(log => 
        `"${log.timestamp}","${log.level}","${log.source.replace('logs/', '')}","${log.message.replace(/"/g, '""')}","${(log.stack || '').replace(/"/g, '""')}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSeedFakeData = async () => {
    setSeedStatus({ type: 'loading', message: 'Seeding comprehensive test data...' });
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/dev/seed-comprehensive-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setSeedStatus({ 
          type: 'success', 
          message: `Successfully seeded data: ${data.data.facilities} facilities, ${data.data.units} units, ${data.data.users} users.` 
        });
      } else {
        setSeedStatus({ type: 'error', message: data.message || 'Failed to seed data.' });
      }
    } catch (error) {
      console.error("Seed data error:", error);
      setSeedStatus({ type: 'error', message: 'An unexpected error occurred.' });
    }
  };

  const handleResetDatabase = async () => {
    setResetStatus({ type: 'loading', message: 'Resetting database...' });
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/dev/reset-database`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setResetStatus({ type: 'success', message: 'Database reset and seeded successfully.' });
      } else {
        setResetStatus({ type: 'error', message: data.message || 'Failed to reset database.' });
      }
    } catch (error) {
      console.error("Reset database error:", error);
      setResetStatus({ type: 'error', message: 'An unexpected error occurred.' });
    }
  };

  // Helper functions for styling
  const getStatusIcon = (status: OperationStatus) => {
    switch (status.type) {
      case 'success': return <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-300" />;
      case 'error': return <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-300" />;
      case 'loading': return <ArrowPathIcon className="h-5 w-5 text-blue-600 dark:text-blue-300 animate-spin" />;
      default: return null;
    }
  };

  const getStatusColor = (status: OperationStatus) => {
    switch (status.type) {
      case 'success': return 'text-green-600 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/20 dark:border-green-800';
      case 'error': return 'text-red-600 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800';
      case 'loading': return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-800';
      default: return 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-300 dark:bg-gray-900/20 dark:border-gray-800';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  const getLogLevelBg = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'bg-red-900/20';
      case 'warn': return 'bg-yellow-900/20';
      case 'info': return 'bg-blue-900/20';
      default: return 'bg-gray-900/20';
    }
  };

  const getSourceColor = (source: string) => {
    if (source.includes('error')) return 'text-red-400';
    if (source.includes('access')) return 'text-purple-400';
    if (source.includes('app')) return 'text-green-400';
    return 'text-gray-400';
  };

  const getFilterButtonClass = (isActive: boolean, type: 'level' | 'source', value: string) => {
    const colorMaps = {
      level: {
        error: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-700 shadow-sm',
        warn: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700 shadow-sm',
        info: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-200 dark:border-blue-700 shadow-sm',
        debug: 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-sm',
      },
      source: {
        'logs/combined.log': 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 border border-green-200 dark:border-green-700 shadow-sm',
        'logs/error.log': 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-700 shadow-sm',
      },
    };

    const inactiveClass = 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600';
    
    // @ts-ignore
    return isActive ? (colorMaps[type][value] || inactiveClass) : inactiveClass;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-2">
            <CodeBracketIcon className="h-8 w-8 text-primary-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Developer Tools
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Utilities for testing, debugging, and data management.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              {(              [
                ['database', CircleStackIcon, 'Database'],
                ['logs', DocumentTextIcon, 'Backend Logs'],
                ['websocket', WifiIcon, 'WebSocket'],
                ['fms', CloudIcon, 'FMS'],
                ['ui-debug', PaintBrushIcon, 'UI Debug']
              ] as const).map(([tab, Icon, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'database' && (
          <div className="space-y-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Development Environment Only
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    These tools perform destructive actions on the database. Use with caution.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <CircleStackIcon className="h-6 w-6 text-green-600" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Seed Fake Data</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Populate the database with a comprehensive set of test data. Best used on a clean database.
            </p>
            <div className="space-y-4">
              <button
                onClick={handleSeedFakeData}
                disabled={seedStatus.type === 'loading'}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                    {seedStatus.type === 'loading' && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                    <span>Seed Test Data</span>
              </button>
              {seedStatus.message && (
                <div className={`p-3 rounded-md border flex items-center space-x-2 ${getStatusColor(seedStatus)}`}>
                  {getStatusIcon(seedStatus)}
                  <span className="text-sm font-medium">{seedStatus.message}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-4">
                  <ArrowPathIcon className="h-6 w-6 text-red-600" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Reset Database</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Drop the entire schema, rebuild it, and apply initial seeds. This will remove ALL data.
            </p>
            <div className="space-y-4">
              <button
                onClick={handleResetDatabase}
                disabled={resetStatus.type === 'loading'}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                    {resetStatus.type === 'loading' && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                <span>Reset to Initial State</span>
              </button>
              {resetStatus.message && (
                <div className={`p-3 rounded-md border flex items-center space-x-2 ${getStatusColor(resetStatus)}`}>
                  {getStatusIcon(resetStatus)}
                  <span className="text-sm font-medium">{resetStatus.message}</span>
                </div>
              )}
            </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                  Console Logs
                  {wsConnected && (
                    <span className="ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                      <SignalIcon className="h-3 w-3 mr-1" /> Live
                    </span>
                  )}
                </h2>
                <div className="flex items-center space-x-2">
                    {!wsConnected && (
                      <button onClick={fetchLogs} disabled={logLoading} className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
                        <ArrowPathIcon className={`h-4 w-4 mr-2 ${logLoading ? 'animate-spin' : ''}`} /> Refresh
                      </button>
                    )}
                  <button onClick={exportToCSV} className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                    <ArrowDownTrayIcon className="h-4 w-4 mr-2" /> Export
                  </button>
          </div>
        </div>

              {/* Filter Controls - Organized in clean sections */}
              <div className="space-y-6">
                {/* Primary Filters Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Log Levels */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Log Levels</label>
                    <div className="flex gap-2">
                      {['error', 'warn', 'info', 'debug'].map(level => (
                        <button
                          key={level}
                          onClick={() => {
                            const newFilter = new Set(logLevelFilter);
                            newFilter.has(level) ? newFilter.delete(level) : newFilter.add(level);
                            setLogLevelFilter(newFilter);
                          }}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${getFilterButtonClass(logLevelFilter.has(level), 'level', level)}`}
                        >
                          {level.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sources */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sources</label>
                    <div className="flex flex-wrap gap-2">
                      {['logs/combined.log', 'logs/error.log'].map(source => (
                        <button
                          key={source}
                          onClick={() => {
                            const newFilter = new Set(sourceFilter);
                            newFilter.has(source) ? newFilter.delete(source) : newFilter.add(source);
                            setSourceFilter(newFilter);
                          }}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${getFilterButtonClass(sourceFilter.has(source), 'source', source)}`}
                        >
                          {source.replace('logs/', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Secondary Controls Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Search */}
                  <div className="space-y-2">
                    <label htmlFor="search-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Search Messages</label>
                    <input
                      id="search-filter"
                      type="text"
                      placeholder="Filter by message content..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  {/* Max Lines */}
                  <div className="space-y-2">
                    <label htmlFor="max-lines" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Max Lines</label>
                    <select
                      id="max-lines"
                      value={maxLines}
                      onChange={(e) => setMaxLines(parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {[50, 100, 200, 500, 1000].map(val => <option key={val} value={val}>{val} lines</option>)}
                    </select>
                  </div>

                  {/* Auto-scroll */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Auto-scroll</label>
                    <button
                      onClick={() => setAutoScroll(!autoScroll)}
                      className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${autoScroll ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-200 dark:border-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'}`}
                    >
                      {autoScroll ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-black rounded-lg shadow-sm border border-gray-700 overflow-hidden">
              <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <div className="text-gray-400 font-mono">
                  {filteredLogs.length} / {consoleLogs.length} entries shown
                </div>
              </div>
              
              <div ref={consoleRef} className="h-96 overflow-y-auto p-4 font-mono text-sm">
                {consoleLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {wsConnected ? 'Waiting for live logs...' : 'No logs loaded. Click "Refresh" to fetch.'}
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div>No logs match current filters.</div>
                    <div className="text-xs mt-2">Try adjusting the level or source filters above.</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredLogs.map((log) => {
                      const isExpanded = expandedLogs.has(log.id);
                      const hasStack = log.stack && log.stack.trim().length > 0;
                      const isLongMessage = log.message.length > 200;
                      const shouldShowExpandButton = hasStack || isLongMessage;
                      
                      return (
                        <div key={log.id} className={`py-1 px-2 rounded ${getLogLevelBg(log.level)}`}>
                          <div className="flex items-start space-x-3">
                            <span className={`text-xs font-bold ${getLogLevelColor(log.level)} flex-shrink-0 w-12`}>{log.level.toUpperCase()}</span>
                            <span className="text-gray-400 text-xs flex-shrink-0 w-32">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            <span className={`text-xs font-medium ${getSourceColor(log.source)} flex-shrink-0 w-20`}>{log.source.replace('logs/', '')}</span>
                            <div className="text-gray-300 flex-1 min-w-0 break-words whitespace-pre-wrap">
                              {isExpanded || !shouldShowExpandButton ? (
                                log.message
                              ) : (
                                <>
                                  {log.message.substring(0, 200)}
                                  {log.message.length > 200 && '...'}
                                </>
                              )}
                            </div>
                            {shouldShowExpandButton && (
                              <button
                                onClick={() => toggleLogExpansion(log.id)}
                                className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-400 transition-colors"
                              >
                                {isExpanded ? 'Collapse' : 'Expand'}
                              </button>
                            )}
                          </div>
                          
                          {isExpanded && hasStack && (
                            <div className="mt-2 ml-16">
                              <div className="text-xs text-gray-400 mb-1 font-medium">Stack Trace:</div>
                              <div className="bg-gray-800 rounded p-2 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto">
                                {log.stack}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'websocket' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">WebSocket Diagnostics</h2>
                <div className="flex items-center space-x-4">
                  {/* Debug Toggle */}
                  <div className="flex items-center space-x-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isDebugEnabled}
                        onChange={toggleDebug}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Debug Toasts
                      </span>
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button onClick={fetchWebSocketStats} disabled={wsLoading} className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
                      <ArrowPathIcon className={`h-4 w-4 mr-2 ${wsLoading ? 'animate-spin' : ''}`} /> Refresh Stats
                    </button>
                    <button onClick={requestDiagnostics} className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                      <SignalIcon className="h-4 w-4 mr-2" /> Request Diagnostics
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Connection Status</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Status:</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${wsConnected ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
                        <WifiIcon className="h-3 w-3 mr-1" />{wsConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Server Statistics</h3>
                  {wsStats ? (
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Total Clients:</span><span className="font-medium text-gray-900 dark:text-white">{wsStats.totalClients}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Total Subscriptions:</span><span className="font-medium text-gray-900 dark:text-white">{wsStats.totalSubscriptions}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Log Watchers:</span><span className="font-medium text-gray-900 dark:text-white">{wsStats.logWatchers}</span></div>
                      {wsStats.subscriptionsByType && Object.keys(wsStats.subscriptionsByType).length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subscriptions by Type:</div>
                          <div className="space-y-1">
                            {Object.entries(wsStats.subscriptionsByType).map(([type, count]) => (
                              <div key={type} className="flex justify-between text-xs">
                                <span className="text-gray-600 dark:text-gray-400">{type}:</span>
                                <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : <p className="text-sm text-gray-500 dark:text-gray-400">Click "Refresh Stats" to load.</p>}
                </div>
              </div>
            </div>

            {diagnostics && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Live Diagnostics</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">All Subscriptions</h4>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3 max-h-60 overflow-auto">
                      <pre className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{JSON.stringify(diagnostics.allSubscriptions, null, 2)}</pre>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Log Watchers</h4>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3 max-h-60 overflow-auto">
                      <pre className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{JSON.stringify(diagnostics.logWatchers, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
        )}

        {activeTab === 'fms' && (
          <FMSToolsTab />
        )}

        {activeTab === 'ui-debug' && (
          <UIDebugTab />
        )}

      </div>
    </div>
  );
}