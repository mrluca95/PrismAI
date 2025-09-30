import React from 'react';

export const Slider = ({
  value = [0],
  min = 0,
  max = 100,
  step = 1,
  onValueChange = () => {},
  className = '',
}) => {
  const current = Array.isArray(value) ? value[0] : Number(value) || 0;
  const handleChange = (event) => {
    const newValue = Number(event.target.value);
    onValueChange([newValue]);
  };

  const percentage = max > min ? ((current - min) / (max - min)) * 100 : 0;

  return (
    <div className={`relative h-2 w-full rounded-full bg-purple-200 ${className}`}>
      <div
        className="absolute left-0 top-0 h-full rounded-full bg-purple-600"
        style={{ width: `${percentage}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
      />
      <div
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 translate-x-[-50%] rounded-full border-2 border-white bg-purple-600 shadow"
        style={{ left: `${percentage}%` }}
      />
    </div>
  );
};

export default Slider;
