import React, { createContext, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const DialogContext = createContext({ open: false, onOpenChange: undefined });

const cn = (...classes) => classes.filter(Boolean).join(' ');

export function Dialog({ open, onOpenChange, children }) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {open ? children : null}
    </DialogContext.Provider>
  );
}

export function DialogContent({ children, className = '', style }) {
  const { open, onOpenChange } = useContext(DialogContext);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleClick = (event) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target)
      ) {
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={contentRef}
        className={cn('relative z-10 w-[90vw] max-w-xl max-h-[90vh] overflow-hidden rounded-2xl bg-white p-6 shadow-2xl', className)}
        style={style}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export const DialogHeader = ({ children, className = '' }) => (
  <div className={cn('mb-4', className)}>{children}</div>
);

export const DialogTitle = ({ children, className = '' }) => (
  <h2 className={cn('text-xl font-semibold text-purple-900', className)}>{children}</h2>
);

export const DialogFooter = ({ children, className = '' }) => (
  <div className={cn('mt-4 flex flex-col gap-3', className)}>{children}</div>
);

export default Dialog;
