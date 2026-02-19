import type { WalletInfo, NetworkId } from "../types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Droplets, ArrowDownToLine } from "lucide-react";
import CopyButton from "./CopyButton";

interface FundWalletProps {
  wallet: WalletInfo;
  network: NetworkId;
  balance: string;
}

export default function FundWallet({ wallet, network, balance }: FundWalletProps) {
  const balanceNum = parseFloat(balance) || 0;
  const isTestnet = network === "base-sepolia";

  // Only show when balance is 0
  if (balanceNum > 0) return null;

  return (
    <Card className="mb-6" id="fund-wallet">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Fund Your Wallet</h3>
          <Badge>
            {isTestnet ? "Testnet" : "Mainnet"}
          </Badge>
        </div>
      </div>
      <div className="p-5">
        {/* Deposit Address */}
        <div className="mb-5 rounded-[10px] p-4 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Deposit Address
            </p>
          </div>
          <div className="font-mono text-sm break-all">
            <CopyButton text={wallet.address} displayText={wallet.address} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Send USDC on {isTestnet ? "Base Sepolia" : "Base"} to this address.
          </p>
        </div>

        {isTestnet ? (
          /* Testnet Faucets */
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="h-4 w-4 text-[#888888]" />
              <p className="text-sm font-medium">Testnet Faucets</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a
                href="https://faucet.circle.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-[10px] bg-white p-3 transition-colors hover:bg-[#EBEBEB]"
              >
                <div>
                  <p className="text-sm font-medium">Circle Faucet</p>
                  <p className="text-xs text-muted-foreground">Get testnet USDC</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
              <a
                href="https://portal.cdp.coinbase.com/products/faucet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-[10px] bg-white p-3 transition-colors hover:bg-[#EBEBEB]"
              >
                <div>
                  <p className="text-sm font-medium">Coinbase Faucet</p>
                  <p className="text-xs text-muted-foreground">Get testnet ETH + USDC</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              After receiving testnet USDC, your balance will update automatically within 15 seconds.
            </p>
          </div>
        ) : (
          /* Mainnet Instructions */
          <div>
            <p className="text-sm font-medium mb-2">How to fund on Mainnet</p>
            <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
              <li>Bridge USDC to Base using the <a href="https://bridge.base.org" target="_blank" rel="noopener noreferrer" className="text-[#111111] hover:underline font-medium">Base Bridge</a></li>
              <li>Or transfer USDC from any exchange that supports Base</li>
              <li>Send to the deposit address above</li>
            </ol>
          </div>
        )}
      </div>
    </Card>
  );
}
