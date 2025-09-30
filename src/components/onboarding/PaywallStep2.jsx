import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function PaywallStep2({ onSelectPlan, onBack }) {
  return (
    <div className="neomorph rounded-2xl p-8 max-w-lg mx-auto text-center border-2 border-yellow-400 bg-purple-100/30 relative">
      <Button variant="ghost" size="icon" onClick={onBack} className="absolute top-4 left-4 text-purple-600 hover:bg-purple-200/50">
        <ArrowLeft />
      </Button>
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-sm font-bold px-4 py-1 rounded-full">Best value</div>
      <h2 className="text-3xl font-bold mb-2 mt-4 text-purple-900">Exclusive offer for early users</h2>
      <p className="text-purple-700 mb-6">Get 30% off Yearly forever after your trial.</p>

      <div className="my-8">
        <p className="text-lg text-gray-500 line-through">$69.99 USD/year</p>
        <p className="text-5xl font-bold text-yellow-500">$47.99 <span className="text-2xl font-normal text-purple-700">USD/year</span></p>
        <p className="font-bold text-green-500">Save 30% for life</p>
      </div>

      <div className="space-y-4">
        <Button onClick={() => onSelectPlan('yearly_special')} size="lg" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-base py-6">
          Get Yearly $47.99
        </Button>
        <Button onClick={() => onSelectPlan('trial')} variant="outline" size="lg" className="w-full bg-transparent border-purple-300 text-purple-700 hover:bg-purple-200/50 hover:text-purple-800 py-6">
          Continue with trial (Monthly after)
        </Button>
      </div>
      
      <p className="text-xs text-gray-500 mt-6">Billing will start after your 7-day free trial ends. You can cancel anytime.</p>
    </div>
  );
}