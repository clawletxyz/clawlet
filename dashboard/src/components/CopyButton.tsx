import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";

interface CopyButtonProps {
  text: string;
  displayText?: string;
  className?: string;
  iconOnly?: boolean;
}

export default function CopyButton({ text, displayText, className = "", iconOnly }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [text]);

  if (iconOnly) {
    return (
      <button
        onClick={handleCopy}
        className="inline-flex items-center p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Copy"
        type="button"
      >
        {copied ? (
          <Check className="h-3 w-3 text-[#111111]" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    );
  }

  return (
    <button
      className={`inline-flex items-center gap-1.5 font-mono text-inherit hover:text-foreground transition-colors cursor-pointer ${className}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Click to copy"}
      type="button"
    >
      <span>{copied ? "Copied!" : (displayText ?? text)}</span>
      {copied ? (
        <Check className="h-3 w-3 text-[#111111]" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}
