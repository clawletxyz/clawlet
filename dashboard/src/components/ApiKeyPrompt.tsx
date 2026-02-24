import { useState } from "react";

interface ApiKeyPromptProps {
  onSubmit: (key: string) => void;
  onRetry: () => void;
}

export default function ApiKeyPrompt({ onSubmit, onRetry }: ApiKeyPromptProps) {
  const [key, setKey] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    onSubmit(key.trim());
    onRetry();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
      <div className="w-full max-w-sm rounded-[20px] bg-[#F2F2F2] p-6">
        <div className="mb-4 flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="4" y="9" width="12" height="8" rx="2" stroke="#111111" strokeWidth="1.5"/>
            <path d="M7 9V7a3 3 0 0 1 6 0v2" stroke="#111111" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <h2 className="text-base font-semibold text-[#111111]">API Key Required</h2>
        </div>
        <p className="mb-4 text-sm text-[#888888]">
          This instance requires an API key. Enter the value of <code className="rounded-[6px] bg-[#E8E8E8] px-1.5 py-0.5 text-xs text-[#111111]">CLAWLET_API_KEY</code> to continue.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter API key"
            className="mb-3 w-full rounded-[10px] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[1.5px] focus:border-[#D0D0D0]"
            autoFocus
          />
          <button
            type="submit"
            disabled={!key.trim()}
            className="w-full rounded-full bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:opacity-40"
          >
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
}
