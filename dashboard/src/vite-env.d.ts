/// <reference types="vite/client" />

export {};

interface EthereumProvider {
  request(args: { method: "eth_signTypedData_v4"; params: [string, string] }): Promise<string>;
  request(args: { method: "eth_accounts" }): Promise<string[]>;
  request(args: { method: "eth_requestAccounts" }): Promise<string[]>;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
