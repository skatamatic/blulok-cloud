import React from 'react';

interface VoiceTranscriptProps {
  userQuery?: string;
  systemResponse?: string;
  className?: string;
}

export const VoiceTranscript: React.FC<VoiceTranscriptProps> = ({
  userQuery,
  systemResponse,
  className = '',
}) => {
  if (!userQuery && !systemResponse) {
    return null;
  }

  return (
    <div className={`bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-gray-700 shadow-md px-4 py-3 ${className}`}>
      <div className="space-y-2 text-sm">
        {userQuery && (
          <div>
            <span className="font-semibold text-gray-700 dark:text-gray-300">User: </span>
            <span className="text-gray-900 dark:text-white">{userQuery}</span>
          </div>
        )}
        {systemResponse && (
          <div>
            <span className="font-semibold text-primary-600 dark:text-primary-400">BluFMS: </span>
            <span className="text-gray-900 dark:text-white">{systemResponse}</span>
          </div>
        )}
      </div>
    </div>
  );
};


