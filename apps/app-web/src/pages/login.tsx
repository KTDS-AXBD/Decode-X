import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: 'rgba(26, 54, 93, 0.1)' }}>
            <ShieldCheck className="w-8 h-8" style={{ color: 'var(--primary)' }} />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            AI Foundry
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Cloudflare Access SSO를 통해 로그인합니다
          </p>
          <Button className="w-full" size="lg">
            SSO 로그인
          </Button>
          <p className="text-xs mt-4" style={{ color: 'var(--text-secondary)' }}>
            KT DS 조직 계정으로 인증됩니다
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
