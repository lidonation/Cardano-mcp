import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/brand/mark-static.svg" type="image/svg+xml" />
        <link rel="icon" href="/icon-32.png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
        <meta name="theme-color" content="#0f1827" />
        <meta property="og:image" content="https://cardano-mcp.dev/og-card.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://cardano-mcp.dev/og-card.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
