import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ERC20_ABI, USDC, RPC_URLS, CHAIN_IDS, CHAINS } from "../constants.js";
import type { WalletAdapter, LocalKeyConfig } from "./types.js";

function getClient(network: string): PublicClient {
  const chainId = CHAIN_IDS[network];
  if (!chainId) throw new Error(`Unsupported network: ${network}`);
  return createPublicClient({
    chain: CHAINS[chainId],
    transport: http(RPC_URLS[network]),
  }) as PublicClient;
}

/**
 * Local private key adapter.
 *
 * Generates and stores a raw private key locally. Best for quick
 * testing and development. The key lives in .clawlet/state.json.
 */
export class LocalKeyAdapter implements WalletAdapter {
  readonly type = "local-key" as const;
  private privateKey: Hex | null;
  private address: Address | null;

  constructor(config?: LocalKeyConfig) {
    if (config) {
      this.privateKey = config.privateKey;
      this.address = privateKeyToAccount(config.privateKey).address;
    } else {
      this.privateKey = null;
      this.address = null;
    }
  }

  async createWallet(): Promise<Address> {
    this.privateKey = generatePrivateKey();
    const account = privateKeyToAccount(this.privateKey);
    this.address = account.address;
    return this.address;
  }

  getAddress(): Address {
    if (!this.address) throw new Error("No wallet created yet.");
    return this.address;
  }

  isInitialized(): boolean {
    return this.privateKey !== null;
  }

  async getBalance(network: string): Promise<string> {
    const address = this.getAddress();
    const usdcAddress = USDC[network];
    if (!usdcAddress) throw new Error(`No USDC address for network: ${network}`);

    const client = getClient(network);

    const balance = (await client.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;

    const decimals = (await client.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    })) as number;

    return formatUnits(balance, decimals);
  }

  async signTypedData(params: {
    domain: { name: string; version: string; chainId: number; verifyingContract: Address };
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<Hex> {
    if (!this.privateKey) throw new Error("No wallet created yet.");
    const account = privateKeyToAccount(this.privateKey);
    return account.signTypedData({
      domain: params.domain,
      types: params.types,
      primaryType: params.primaryType,
      message: params.message,
    });
  }

  toJSON(): LocalKeyConfig {
    if (!this.privateKey) throw new Error("No wallet created yet.");
    return { type: "local-key", privateKey: this.privateKey };
  }
}
