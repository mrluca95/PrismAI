import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from '@/context/AuthContext.jsx';
import OnboardingLayout from "../components/onboarding/OnboardingLayout";
import WelcomeStep from "../components/onboarding/WelcomeStep";
import BasicsStep from "../components/onboarding/BasicsStep";
import FinancialsStep from "../components/onboarding/FinancialsStep";
import RiskQuizStep from "../components/onboarding/RiskQuizStep";
import ProjectionStep from "../components/onboarding/ProjectionStep";

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState({
    age: "",
    experience: "Beginner",
    goal: "Growth",
    horizon: "5+y",
    income: "$50k-$100k",
    investableAssets: "$10k-$50k",
    monthlyContribution: 500,
    emergencyFund: true,
    debtTolerance: "Medium",
    riskAnswers: Array(5).fill(null),
  });

  useEffect(() => {
    if (user?.onboardingCompleted) {
      navigate(createPageUrl("Dashboard"), { replace: true });
    }
  }, [user, navigate]);

  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  
  const handleSkip = async () => {
    try {
      await updateProfile({ onboardingCompleted: true, plan: 'free' });
    } finally {
      navigate(createPageUrl("Dashboard"));
    }
  };

  const handleFinish = async () => {
    try {
      await updateProfile({
        onboardingCompleted: true,
        profile: data,
        plan: 'free',
      });
    } finally {
      navigate(createPageUrl("Dashboard"));
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <WelcomeStep onNext={handleNext} onSkip={handleSkip} />;
      case 2: return <BasicsStep data={data} setData={setData} onNext={handleNext} />;
      case 3: return <FinancialsStep data={data} setData={setData} onNext={handleNext} />;
      case 4: return <RiskQuizStep data={data} setData={setData} onNext={handleNext} />;
      case 5: return <ProjectionStep data={data} setData={setData} onNext={handleFinish} />;
      default: return <WelcomeStep onNext={handleNext} onSkip={handleSkip} />;
    }
  };

  return (
    <OnboardingLayout
      currentStep={currentStep}
      totalSteps={TOTAL_STEPS}
      onBack={handleBack}
    >
      {renderStep()}
    </OnboardingLayout>
  );
}