import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bsc, bscTestnet } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Probly",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "probly-bnb-hackathon",
  chains: [bsc, bscTestnet],
  ssr: false,
});
