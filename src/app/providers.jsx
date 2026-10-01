'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** React Query + Ant Design, with a theme that follows the OS light/dark pref. */
export default function Providers({ children }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // A 401 means the hub proxy exhausted refresh and cleared the session
        // cookies; there's nothing left to retry, so send the operator to login.
        queryCache: new QueryCache({
          onError: (error) => {
            if (error?.status === 401 && typeof window !== 'undefined') {
              window.location.assign('/login');
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) =>
              error?.status === 401 ? false : failureCount < 1,
          },
        },
      }),
  );

  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const onChange = (e) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: { colorPrimary: '#2a78d6', borderRadius: 8 },
        }}
      >
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ConfigProvider>
    </AntdRegistry>
  );
}
