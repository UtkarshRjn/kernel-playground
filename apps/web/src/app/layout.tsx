import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@/components/posthog";
import { ThemeProvider, ThemedToaster } from "@/components/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kernel Playground — compare your kernel across GPUs",
  description:
    "Write GPU kernels in the browser and run the same kernel across T4, A100, B200 and more — side by side, with trustworthy benchmarks and per-dollar comparison.",
};

// Apply the saved/system theme before paint to avoid a flash.
const noFlash = `(function(){try{var t=localStorage.getItem('kp-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <ThemeProvider>
          <div className="bg-glow" aria-hidden />
          {children}
          <ThemedToaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
