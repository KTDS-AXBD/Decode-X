import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileSearch, CheckSquare, Code2, BarChart3, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DEMO_USERS } from '@/api/auth-store';

const ROLE_CONFIG: Record<string, { icon: typeof FileSearch; color: string }> = {
  Analyst:   { icon: FileSearch,  color: '#3b82f6' },
  Reviewer:  { icon: CheckSquare, color: '#10b981' },
  Developer: { icon: Code2,       color: '#8b5cf6' },
  Executive: { icon: BarChart3,   color: '#f59e0b' },
  Client:    { icon: Eye,         color: '#6b7280' },
};

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = (userId: string) => {
    login(userId);
    navigate('/', { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <span className="text-2xl font-bold" style={{ color: 'var(--primary-foreground)' }}>
              AI
            </span>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            AI Foundry
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            데모 사용자를 선택하여 로그인하세요
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEMO_USERS.map((user) => {
            const config = ROLE_CONFIG[user.userRole] ?? ROLE_CONFIG["Client"]!;
            const Icon = config.icon;
            return (
              <Card
                key={user.userId}
                className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-2 hover:border-current"
                style={{ '--card-accent': config.color } as React.CSSProperties}
                onClick={() => handleLogin(user.userId)}
              >
                <CardContent className="p-6 text-center">
                  <div
                    className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: `${config.color}15` }}
                  >
                    <Icon className="w-7 h-7" style={{ color: config.color }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                    {user.userName}
                  </h3>
                  <Badge
                    className="mb-2"
                    style={{
                      backgroundColor: `${config.color}20`,
                      color: config.color,
                      border: `1px solid ${config.color}40`,
                    }}
                  >
                    {user.userRole}
                  </Badge>
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    {user.label}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-foreground)' }}>
          프로덕션 환경에서는 Cloudflare Access SSO로 인증됩니다
        </p>
      </div>
    </div>
  );
}
