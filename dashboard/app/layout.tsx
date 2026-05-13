import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from './_components/Toast';

export const metadata: Metadata = {
  title: 'gstack↔gbrain remote',
  description: "Your AI's memory and your AI's actions, one click apart.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
