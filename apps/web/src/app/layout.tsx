import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kernel Playground — compare your kernel across GPUs",
  description:
    "Write GPU kernels in the browser and run the same kernel across T4, A100, B200 and more — side by side, with trustworthy benchmarks and per-dollar comparison.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
