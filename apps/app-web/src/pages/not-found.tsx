import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
      <div className="text-8xl font-bold mb-4" style={{ color: 'var(--primary)', opacity: 0.2 }}>404</div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        페이지를 찾을 수 없습니다
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </p>
      <Link to="/">
        <Button>
          <Home className="w-4 h-4 mr-2" />
          대시보드로 이동
        </Button>
      </Link>
    </div>
  );
}
