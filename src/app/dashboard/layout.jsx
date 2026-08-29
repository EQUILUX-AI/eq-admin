'use client';

import { LogoutOutlined, ThunderboltFilled } from '@ant-design/icons';
import { Button, Layout, Space, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const { Header, Content } = Layout;
const { Text } = Typography;

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
            ghost
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
