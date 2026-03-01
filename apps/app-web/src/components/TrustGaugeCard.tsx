import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TrustGaugeCardProps {
  level: string;
  title: string;
  description: string;
  score: number;
}

const getScoreColor = (score: number) => {
  if (score >= 0.80) return { color: 'var(--success)', bg: 'var(--success-light)', label: '우수' };
  if (score >= 0.70) return { color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)', label: '양호' };
  return { color: 'var(--danger)', bg: 'var(--danger-light)', label: '주의' };
};

export const TrustGaugeCard: React.FC<TrustGaugeCardProps> = ({ level, title, description, score }) => {
  const colorConfig = getScoreColor(score);
  const percentage = score * 100;
  const rotation = (score - 0.5) * 180; // -90 to +90 degrees

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <Badge
              className="mb-2"
              style={{
                backgroundColor: 'rgba(26, 54, 93, 0.1)',
                color: 'var(--primary)',
                border: 'none',
              }}
            >
              {level}
            </Badge>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Badge
            style={{
              backgroundColor: colorConfig.bg,
              color: colorConfig.color,
              border: 'none',
            }}
          >
            {colorConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gauge Visual */}
        <div className="flex items-center justify-center py-4">
          <div className="relative w-40 h-20">
            {/* Background arc */}
            <svg viewBox="0 0 160 80" className="w-full h-full">
              {/* Background arc (gray) */}
              <path
                d="M 10 70 A 70 70 0 0 1 150 70"
                fill="none"
                stroke="var(--border)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              {/* Colored arc based on score */}
              <path
                d="M 10 70 A 70 70 0 0 1 150 70"
                fill="none"
                stroke={colorConfig.color}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${percentage * 2.2} 220`}
              />
              {/* Needle */}
              <g transform={`rotate(${rotation} 80 70)`}>
                <line
                  x1="80"
                  y1="70"
                  x2="80"
                  y2="15"
                  stroke={colorConfig.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="80" cy="70" r="5" fill={colorConfig.color} />
              </g>
            </svg>
            {/* Score display */}
            <div className="absolute bottom-0 left-0 right-0 text-center">
              <div className="text-3xl font-bold" style={{ color: colorConfig.color }}>
                {score.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
