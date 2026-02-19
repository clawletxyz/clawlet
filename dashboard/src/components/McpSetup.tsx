import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Terminal, Copy, Check, Wrench, ChevronRight } from "lucide-react";
import { useState, useCallback } from "react";
import { Highlight, themes } from "prism-react-renderer";

const MCP_CONFIG = `{
  "mcpServers": {
    "clawlet": {
      "command": "npx",
      "args": ["clawlet"]
    }
  }
}`;

const SDK_SNIPPET = `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const response = await client.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 1024,
  messages: [{ role: "user", content: "..." }],
  tools: [{
    type: "mcp",
    server_label: "clawlet",
    server_url: "http://localhost:3000/mcp",
  }],
});`;

const TOOLS = [
  { name: "get_wallet", desc: "Retrieve wallet address & status" },
  { name: "get_balance", desc: "Check USDC balance on Base" },
  { name: "x402_fetch", desc: "Make x402 payment requests" },
  { name: "set_rules", desc: "Configure spending limits" },
  { name: "get_rules", desc: "View current spending rules" },
  { name: "get_transactions", desc: "List recent transactions" },
  { name: "freeze_wallet", desc: "Freeze wallet to block payments" },
  { name: "unfreeze_wallet", desc: "Unfreeze wallet" },
];

function CodeBlock({ code, label, language }: { code: string; label: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [code]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-[#111111]" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <Highlight theme={themes.nightOwl} code={code.trim()} language={language}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="overflow-x-auto rounded-[10px] p-3.5 text-[11px] font-mono leading-relaxed"
            style={{ ...style, background: "#1a1a2e" }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export default function McpSetup() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="my-6" id="mcp-setup">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[#F2F2F2] rounded-[20px]"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">MCP Integration</h3>
          <span className="text-xs text-[#888888]">Connect AI agents via MCP</span>
        </div>
        <ChevronRight
          className={`h-4 w-4 text-[#888888] transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-[#E8E8E8]">
          <div className="p-5">
            <p className="text-xs text-muted-foreground mb-5">
              Add clawlet to Claude Desktop or use the Anthropic Agent SDK.
            </p>

            <div className="mb-5">
              <CodeBlock code={MCP_CONFIG} label="Claude Desktop / claude_desktop_config.json" language="json" />
            </div>

            <div className="mb-5">
              <CodeBlock code={SDK_SNIPPET} label="Anthropic Agent SDK" language="typescript" />
            </div>

            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Available Tools</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TOOLS.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-2 rounded-[10px] bg-white p-2.5"
                  >
                    <code className="shrink-0 rounded-[6px] bg-[#E8E8E8] px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                      {tool.name}
                    </code>
                    <span className="text-[11px] text-muted-foreground">{tool.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="https://www.x402scan.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <img src="/providers/x402.svg" alt="" className="h-3.5 w-3.5" />
                x402scan Explorer
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://www.x402.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <img src="/providers/x402.svg" alt="" className="h-3.5 w-3.5" />
                x402 Protocol
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                MCP Docs
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
