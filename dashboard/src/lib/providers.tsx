import { Key, Layers } from "lucide-react";

export interface ProviderMeta {
  name: string;
  logo?: string;
  icon?: typeof Key;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  "local-key": { name: "Self-Custodial", icon: Key },
  browser: { name: "MetaMask", logo: "/providers/metamask.png" },
  privy: { name: "Privy", logo: "/providers/privy.svg" },
  "coinbase-cdp": { name: "Coinbase CDP", logo: "/providers/coinbase.svg" },
  crossmint: { name: "Crossmint", icon: Layers },
};

export function getProviderMeta(adapter: string): ProviderMeta {
  return PROVIDER_META[adapter] ?? { name: adapter, icon: Key };
}

/** Renders a 20×20 (default) provider icon — either an <img> or a Lucide icon. */
export function ProviderIcon({
  adapter,
  size = 20,
  className = "",
}: {
  adapter: string;
  size?: number;
  className?: string;
}) {
  const meta = getProviderMeta(adapter);
  if (meta.logo) {
    return (
      <img
        src={meta.logo}
        alt={meta.name}
        className={className}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  const Icon = meta.icon ?? Key;
  return <Icon className={className} style={{ width: size * 0.85, height: size * 0.85 }} />;
}
