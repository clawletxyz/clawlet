import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
  type PublicClient,
} from "viem";
import { ERC20_ABI, USDC, RPC_URLS, CHAIN_IDS, CHAINS } from "../constants.js";

function getClient(network: string): PublicClient {
  const chainId = CHAIN_IDS[network];
  if (!chainId) throw new Error(`Unsupported network: ${network}`);
  return createPublicClient({
    chain: CHAINS[chainId],
    transport: http(RPC_URLS[network]),
  }) as PublicClient;
}

/** Query on-chain USDC balance for any address. */
export async function getUsdcBalance(address: Address, network: string): Promise<string> {
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
