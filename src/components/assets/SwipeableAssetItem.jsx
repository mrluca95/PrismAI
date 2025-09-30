import React, { useState, useRef, useEffect } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/context/CurrencyContext.jsx";

export default function SwipeableAssetItem({ asset, onEdit, onDelete, isDeleting }) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const itemRef = useRef(null);
  const maxSwipe = 80; // Maximum swipe distance
  const { format } = useCurrency();

  const isPositive = (asset.gain_loss || 0) >= 0;

  const handleTouchStart = (e) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;

    const clampedOffset = Math.max(-maxSwipe, Math.min(maxSwipe, diff));
    setSwipeOffset(clampedOffset);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);

    if (Math.abs(swipeOffset) > maxSwipe * 0.5) {
      if (swipeOffset < 0) {
        setSwipeOffset(-maxSwipe);
      } else {
        setSwipeOffset(maxSwipe);
      }
    } else {
      setSwipeOffset(0);
    }
  };

  const handleMouseDown = (e) => {
    setStartX(e.clientX);
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => {
        const currentX = e.clientX;
        const diff = currentX - startX;
        const clampedOffset = Math.max(-maxSwipe, Math.min(maxSwipe, diff));
        setSwipeOffset(clampedOffset);
      };

      const handleMouseUp = () => {
        setIsDragging(false);

        if (Math.abs(swipeOffset) > maxSwipe * 0.5) {
          if (swipeOffset < 0) {
            setSwipeOffset(-maxSwipe);
          } else {
            setSwipeOffset(maxSwipe);
          }
        } else {
          setSwipeOffset(0);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, startX, swipeOffset, maxSwipe]);

  const handleEdit = () => {
    setSwipeOffset(0);
    onEdit(asset);
  };

  const handleDelete = () => {
    setSwipeOffset(0);
    onDelete(asset.id);
  };

  return (
    <div className="relative overflow-hidden neomorph rounded-2xl">
      <div className="absolute inset-0 flex">
        <div
          className="flex-1 bg-blue-500 flex items-center justify-start pl-6"
          style={{ transform: `translateX(${Math.min(0, swipeOffset)}px)` }}
        >
          <button
            onClick={handleEdit}
            className="bg-white rounded-full p-3 shadow-lg"
            disabled={isDeleting}
          >
            <Edit3 className="w-5 h-5 text-blue-600" />
          </button>
          <span className="ml-3 text-white font-medium">Edit</span>
        </div>

        <div
          className="flex-1 bg-red-500 flex items-center justify-end pr-6"
          style={{ transform: `translateX(${Math.max(0, swipeOffset)}px)` }}
        >
          <span className="mr-3 text-white font-medium">Delete</span>
          <button
            onClick={handleDelete}
            className="bg-white rounded-full p-3 shadow-lg"
            disabled={isDeleting}
          >
            <Trash2 className="w-5 h-5 text-red-600" />
          </button>
        </div>
      </div>

      <div
        ref={itemRef}
        className={`relative bg-white p-4 transition-transform duration-200 select-none ${
          isDeleting ? 'opacity-50' : ''
        }`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-bold text-gray-800">{asset.symbol}</h3>
              <Badge variant="secondary" className="text-xs capitalize">
                {asset.type}
              </Badge>
            </div>
            <p className="text-gray-600 text-sm">{asset.name}</p>
            <p className="text-gray-500 text-xs">{asset.broker}</p>
          </div>

          <div className="text-right">
            <p className="font-bold text-gray-800">{format(asset.market_value)}</p>
            <p className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}{format(Math.abs(asset.gain_loss), { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {asset.quantity} shares @ {format(asset.current_price, { maximumFractionDigits: 2 })}
          </div>

          {swipeOffset === 0 && (
            <div className="flex space-x-1">
              <div className="w-1 h-1 bg-gray-400 rounded-full opacity-30"></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full opacity-30"></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full opacity-30"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
