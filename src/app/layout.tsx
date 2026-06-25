import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: '\u6279\u91cf\u56fe\u751f\u56fe\u5de5\u5177',
  description: '\u6279\u91cf\u4e0a\u4f20\u56fe\u7247\uff0c\u8f93\u5165\u63d0\u793a\u8bcd\uff0c\u4f7f\u7528 AI \u6279\u91cf\u751f\u6210\u98ce\u683c\u5316\u56fe\u7247\u3002',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="en" className="dark">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
