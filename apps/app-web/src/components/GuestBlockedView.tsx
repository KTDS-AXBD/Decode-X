// F384: Guest 차단 화면 — write 기능 접근 시 로그인 CTA 표시
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function GuestBlockedView() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">데모 모드에서 사용할 수 없는 기능이에요</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          이 기능은 로그인 후 사용할 수 있어요. Google 계정으로 로그인하면 모든 기능을 이용할 수 있어요.
        </p>
      </div>
      <Button asChild>
        <Link to="/welcome">로그인하기</Link>
      </Button>
    </div>
  );
}
