import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PopoverContext = createContext({ open: false, onOpenChange: undefined, triggerRef: null });

const cn = (...classes) => classes.filter(Boolean).join(' ');

export function Popover({ open, onOpenChange, children }) {
  const triggerRef = useRef(null);
  const contextValue = useMemo(() => ({ open, onOpenChange, triggerRef }), [open, onOpenChange]);
  return (
    <PopoverContext.Provider value={contextValue}>
      {children}
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({ children, asChild }) {
  const { open, onOpenChange, triggerRef } = useContext(PopoverContext);
  const handleClick = (event) => {
    children.props?.onClick?.(event);
    onOpenChange?.(!open);
  };

  const props = {
    ref: triggerRef,
    onClick: handleClick,
    'aria-expanded': open ? 'true' : 'false',
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, props);
  }

  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

const transformMap = {
  bottom: 'translate(-50%, 8px)',
  top: 'translate(-50%, calc(-100% - 8px))',
  left: 'translate(calc(-100% - 8px), -50%)',
  right: 'translate(8px, -50%)',
};

export function PopoverContent({ children, className = '', style, side = 'bottom' }) {
  const { open, onOpenChange, triggerRef } = useContext(PopoverContext);
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const positions = {
      bottom: {
        top: rect.bottom + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX,
      },
      top: {
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX,
      },
      left: {
        top: rect.top + rect.height / 2 + window.scrollY,
        left: rect.left + window.scrollX,
      },
      right: {
        top: rect.top + rect.height / 2 + window.scrollY,
        left: rect.right + window.scrollX,
      },
    };
    setPosition(positions[side] || positions.bottom);
  }, [open, triggerRef, side]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleClick = (event) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onOpenChange, triggerRef]);

  if (!open) {
    return null;
  }

  const transform = transformMap[side] || transformMap.bottom;

  return createPortal(
    <div
      ref={contentRef}
      className={cn('absolute z-50 min-w-[10rem] rounded-2xl bg-white p-4 shadow-xl', className)}
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        transform,
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export default Popover;
