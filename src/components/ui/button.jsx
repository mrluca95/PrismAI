import React from 'react';

const variantStyles = {
  default: 'bg-purple-600 text-white hover:bg-purple-700',
  outline: 'border border-purple-400 text-purple-700 hover:bg-purple-100',
  ghost: 'text-purple-700 hover:bg-purple-100/60',
  link: 'text-purple-700 underline-offset-4 hover:underline bg-transparent',
};

const sizeStyles = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
  icon: 'h-10 w-10 p-0 flex items-center justify-center',
};

const baseStyles = 'inline-flex items-center justify-center rounded-xl font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50 disabled:pointer-events-none';

const cn = (...classes) => classes.filter(Boolean).join(' ');

export const Button = React.forwardRef(function Button(
  { variant = 'default', size = 'md', className = '', children, ...props },
  ref,
) {
  const variantClass = variantStyles[variant] || variantStyles.default;
  const sizeClass = sizeStyles[size] || sizeStyles.md;
  return (
    <button
      ref={ref}
      className={cn(baseStyles, variantClass, sizeClass, className)}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;
