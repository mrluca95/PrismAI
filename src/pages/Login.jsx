import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button.jsx';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/?$/, '');

const initialForm = {
  name: '',
  email: '',
  password: '',
};

const Input = ({ label, type = 'text', name, value, onChange, autoComplete, required = true }) => (
  <label className="flex flex-col text-sm font-medium text-purple-800">
    {label}
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      required={required}
      className="mt-2 rounded-xl border border-purple-200 bg-white/80 px-4 py-3 text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
    />
  </label>
);

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [autoRegisterPrompt, setAutoRegisterPrompt] = useState(false);
  const navigate = useNavigate();
  const { login, register, providers, loading, error: authError } = useAuth();

  useEffect(() => {
    if (!authError) {
      return;
    }

    let message = authError?.message || 'Authentication failed. Please try again.';
    const detailMessage = Array.isArray(authError?.details)
      ? authError.details.find((item) => item?.message)?.message
      : null;

    if (!message && detailMessage) {
      message = detailMessage;
    }

    if (authError?.status === 404 || authError?.code === 'ACCOUNT_NOT_FOUND') {
      message = "We couldn't find an account with that email. Let's create one!";
    } else if (authError?.status === 401 || authError?.code === 'INVALID_CREDENTIALS') {
      message = 'Incorrect password. Please try again.';
    } else if (authError?.status === 403 || authError?.code === 'PASSWORD_LOGIN_UNAVAILABLE') {
      message = 'This account was created with Google Sign-In. Please use the Google option to continue.';
    } else if (authError?.status === 409 || authError?.code === 'ACCOUNT_EXISTS') {
      message = 'An account with this email already exists. Try signing in instead.';
    }

    setFormError(message);
  }, [authError]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const switchMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setForm(initialForm);
    setFormError(null);
    setAutoRegisterPrompt(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setAutoRegisterPrompt(false);
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
      } else {
        await register({ email: form.email, password: form.password, name: form.name });
      }
      navigate(createPageUrl('Dashboard'), { replace: true });
    } catch (error) {
      let message = error?.message || "Authentication failed. Please try again.";

      if (mode === 'login') {
        if (error?.status === 404 || error?.code === 'ACCOUNT_NOT_FOUND') {
          message = "We couldn't find an account with that email. Let's create one!";
          setMode('register');
          setAutoRegisterPrompt(true);
          setForm((prev) => ({ ...initialForm, email: prev.email, password: prev.password }));
        } else if (error?.status === 401 || error?.code === 'INVALID_CREDENTIALS') {
          message = "Incorrect password. Please try again.";
          setAutoRegisterPrompt(false);
        } else if (error?.status === 403 || error?.code === 'PASSWORD_LOGIN_UNAVAILABLE') {
          message = "This account was created with Google Sign-In. Please use the Google option to continue.";
          setAutoRegisterPrompt(false);
        } else {
          setAutoRegisterPrompt(false);
        }
      } else {
        if (error?.status === 409 || error?.code === 'ACCOUNT_EXISTS') {
          message = "An account with this email already exists. Try signing in instead.";
          setMode('login');
          setAutoRegisterPrompt(false);
          setForm((prev) => ({ ...initialForm, email: prev.email }));
        } else if (error?.status === 400) {
          const firstDetailMessage = Array.isArray(error?.details) ? error.details.find((item) => item?.message)?.message : null;
          if (!message && firstDetailMessage) {
            message = firstDetailMessage;
          }
          setAutoRegisterPrompt(false);
          setMode('register');
        } else {
          setAutoRegisterPrompt(false);
          setMode('register');
        }
      }

      if (!message) {
        message = 'Something went wrong. Please try again.';
      }
      setFormError(message);
      console.warn('[auth] form error', { mode, status: error?.status, code: error?.code, message, details: error?.details });
    } finally {
      setSubmitting(false);
    }
  };

  const googleEnabled = providers?.google && API_BASE_URL;
  const googleHref = googleEnabled ? `${API_BASE_URL}/auth/google` : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-100 via-white to-purple-100 p-4">
      <div className="w-full max-w-md neomorph rounded-3xl bg-white/80 p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-purple-900">Welcome to Prism AI</h1>
          <p className="text-sm text-purple-600">
            {mode === 'login' ? 'Sign in to continue to your investment copilot.' : 'Create an account to unlock personalized AI insights.'}
          </p>
        </div>

        {mode === 'register' && autoRegisterPrompt && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
            We couldn't find an account for that email. Complete the details below to create one.
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <Input
              label="Full Name"
              name="name"
              value={form.name}
              onChange={handleInputChange}
              autoComplete="name"
            />
          )}
          <Input
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleInputChange}
            autoComplete="email"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleInputChange}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <Button
            type="submit"
            disabled={submitting || loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 text-base"
          >
            {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        {googleEnabled && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs uppercase text-purple-400">
              <span className="flex-1 border-t border-purple-200" />
              <span>or</span>
              <span className="flex-1 border-t border-purple-200" />
            </div>
            <a
              href={googleHref}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-white px-4 py-3 text-sm font-medium text-purple-700 transition hover:border-purple-400 hover:bg-purple-50"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-5 w-5" />
              Continue with Google
            </a>
          </div>
        )}

        <div className="text-center text-sm text-purple-700">
          {mode === 'login' ? (
            <span>
              New to Prism?{' '}
              <button type="button" onClick={switchMode} className="font-semibold text-purple-800 hover:underline">
                Create an account
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button type="button" onClick={switchMode} className="font-semibold text-purple-800 hover:underline">
                Sign in instead
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
