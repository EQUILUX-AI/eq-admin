'use client';

import { LogoutOutlined, ThunderboltFilled } from '@ant-design/icons';
import { Button, Layout, Space, Typography } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const { Header, Content } = Layout;
const { Text } = Typography;

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/connections', label: 'Connections' },
];

function readUserCookie() {
  const match = document.cookie.split('; ').find((c) => c.startsWith('eq_user='));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')));
  } catch {
    return null;
  }
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(readUserCookie());
  }, []);

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingInline: 24,
        }}
      >
        <Space size={10}>
          <ThunderboltFilled style={{ color: '#eda100', fontSize: 20 }} />
          <Text strong style={{ color: '#fff', fontSize: 16 }}>
            Equilux Admin
          </Text>
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                color: pathname === href ? '#fff' : 'rgba(255,255,255,0.65)',
                fontWeight: pathname === href ? 600 : 400,
                marginLeft: 12,
              }}
            >
              {label}
            </Link>
          ))}
        </Space>
        <Space size={16}>
          {user?.fullName || user?.username ? (
            <Text style={{ color: 'rgba(255,255,255,0.75)' }}>
              {user.fullName || user.username}
            </Text>
          ) : null}
          <Button
            size="small"
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{
              color: '#fff',
              background: 'transparent',
              borderColor: 'rgba(255,255,255,0.45)',
            }}
          >
            Sign out
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {children}
      </Content>
    </Layout>
  );
}
