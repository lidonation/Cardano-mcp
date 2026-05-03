import "../styles/tokens.css";
import "../styles/globals.css";
import type { AppProps } from "next/app";
import { GeistSans, GeistMono } from "../lib/fonts";
import { CommandPalette } from "../components/CommandPalette";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <Component {...pageProps} />
      <CommandPalette />
    </div>
  );
}
