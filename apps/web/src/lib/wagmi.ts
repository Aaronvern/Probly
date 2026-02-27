import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bsc, bscTestnet } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Probly",
  projectId: "probly-bnb-hackathon",
  chains: [bsc, bscTestnet],
  ssr: true,
});
