import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function OnboardingLayout({ children, currentStep, totalSteps, onBack }) {
  const progressValue = (currentStep / totalSteps) * 100;

  return (
    <div className="min-h-screen w-full text-purple-900 flex flex-col items-center justify-center p-4" style={{ backgroundColor: 'var(--background-color)' }}>
      <div className="w-full max-w-2xl mx-auto">
        <div className="absolute top-6 left-6">
          {currentStep > 1 && currentStep < totalSteps - 1 && (
            <Button variant="ghost" size="icon" onClick={onBack} className="text-purple-600 hover:bg-purple-200/50">
              <ArrowLeft />
            </Button>
          )}
        </div>
        <div className="absolute top-8 w-full left-0 px-24">
           <Progress value={progressValue} className="w-full h-2 bg-purple-200 [&>*]:bg-purple-600" />
        </div>
        
        <main className="w-full transition-opacity duration-500 ease-in-out">
          {children}
        </main>
      </div>
    </div>
  );
}