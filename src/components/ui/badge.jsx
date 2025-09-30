import React from 'react';

const variantStyles = {
  default: 'bg-purple-200 text-purple-800',
  secondary: 'bg-purple-100 text-purple-700',
  success: 'bg-green-100 text-green-700',
};

const cn = (...classes) => classes.filter(Boolean).join(' ');

export const Badge = ({ variant = 'default', className = '', children }) => {
  const variantClass = variantStyles[variant] || variantStyles.default;
  return (
    <span className={cn('inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium', variantClass, className)}>
      {children}
    </span>
  );
};

export default Badge;
