import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

// Never SSR wallet providers — they use indexedDB, idb-keyval, WalletConnect etc.
const Providers = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Probly — The 1inch of BNB Prediction Markets",
  description: "Aggregate liquidity across Opinion Labs, Predict.fun, and Probable. Best prices, arb detection, smart routing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
