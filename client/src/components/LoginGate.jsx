import { useState } from "react";
import { api } from "../api.js";

const SESSION_KEY = "bigin_dashboard_unlocked";

export function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

function IconEye(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7-10.5-7-10.5-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10.5 7 10.5 7a13.16 13.16 0 0 1-2.16 3.19m-3.35 2.5A9.12 9.12 0 0 1 12 19c-7 0-10.5-7-10.5-7A13.16 13.16 0 0 1 4.94 8.16" />
      <path d="M9.53 9.53a3 3 0 0 0 4.24 4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

export default function LoginGate({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    api
      .login(password)
      .then(() => {
        sessionStorage.setItem(SESSION_KEY, "1");
        onUnlock();
      })
      .catch((err) => setError(err.message || "Incorrect password"))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 backdrop-blur-md p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-8"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-lg bg-navy-900 flex items-center justify-center text-pink-400 font-display font-bold">
            B
          </span>
          <p className="font-display font-bold text-navy-900 text-lg">
            Bigin<span className="text-pink-500">.</span>Analysis
          </p>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          Enter the password to open this dashboard.
        </p>

        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          Password
        </label>
                <div className="relative mb-3">
          <input
            type={showPassword ? "text" : "password"}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-11 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-pink-400/60 focus:border-pink-400"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-navy-700 cursor-pointer"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <IconEyeOff className="w-5 h-5" />
            ) : (
              <IconEye className="w-5 h-5" />
            )}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 mb-3 -mt-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-pink-400 text-white text-sm font-medium py-2.5 shadow-sm disabled:opacity-60"
        >
          {submitting ? "Checking…" : "Unlock dashboard"}
        </button>
      </form>
    </div>
  );
}