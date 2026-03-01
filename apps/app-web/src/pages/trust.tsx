import { TrustGaugeCard } from '@/components/TrustGaugeCard';
import { PolicyQualityChart } from '@/components/PolicyQualityChart';
import { HitlOperationsCard } from '@/components/HitlOperationsCard';
import { ReasoningEngineCard } from '@/components/ReasoningEngineCard';
import { GoldenTestCard } from '@/components/GoldenTestCard';

export default function TrustDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          신뢰도 & 품질 대시보드 Trust & Quality Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          AI 시스템 신뢰도 모니터링 및 품질 지표 관리
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <TrustGaugeCard level="L1" title="출력 신뢰도" description="개별 AI 추론 결과 품질" score={0.82} />
        <TrustGaugeCard level="L2" title="Skill 신뢰도" description="패키지 수준 검증 결과" score={0.78} />
        <TrustGaugeCard level="L3" title="시스템 신뢰도" description="전체 파이프라인 안정성" score={0.85} />
      </div>

      <div className="grid grid-cols-[60%_40%] gap-6">
        <PolicyQualityChart />
        <HitlOperationsCard />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <ReasoningEngineCard />
        <GoldenTestCard />
      </div>
    </div>
  );
}
