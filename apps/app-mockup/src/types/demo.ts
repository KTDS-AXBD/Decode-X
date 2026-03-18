export interface DomainConfig {
  id: string;
  name: string;
  emoji: string;
  organizationId: string;
  description: string;
  stats: {
    policies: number;
    skills: number;
    terms: number;
  };
}

export const DOMAINS: DomainConfig[] = [
  {
    id: "giftvoucher",
    name: "온누리상품권",
    emoji: "🎫",
    organizationId: "LPON",
    description: "LPON 전자식 온누리상품권 플랫폼",
    stats: { policies: 848, skills: 859, terms: 7332 },
  },
  {
    id: "pension",
    name: "퇴직연금",
    emoji: "💰",
    organizationId: "Miraeasset",
    description: "미래에셋 퇴직연금 관리 시스템",
    stats: { policies: 2827, skills: 3065, terms: 0 },
  },
];
