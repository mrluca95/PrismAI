import React from 'react';

export const Progress = ({ value = 0, className = '' }) => {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-purple-200 ${className}`}>
      <div
        className="absolute left-0 top-0 h-full rounded-full bg-purple-600 transition-all duration-300"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
};

export default Progress;
