import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Probly — The 1inch of BNB Prediction Markets",
  description: "Aggregate liquidity across Opinion Labs, Predict.fun, and Probable. Best prices, arb detection, smart routing.",
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
