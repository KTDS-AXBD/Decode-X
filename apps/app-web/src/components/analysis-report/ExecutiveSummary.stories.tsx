import type { Meta, StoryObj } from "@storybook/react";
import { ExecutiveSummary } from "./ExecutiveSummary";

const meta: Meta<typeof ExecutiveSummary> = {
  title: "AnalysisReport/ExecutiveSummary",
  component: ExecutiveSummary,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ExecutiveSummary>;

export const ReadyHigh: Story = {
  args: {
    score: 90,
    headline: "이 분석 결과, 즉시 활용 가능",
    detail: "SI 산출물에서 추출한 비즈니스 정책·용어·Skill은 즉시 활용 가능. 시스템 통합 설계는 전문가 보완 필요.",
  },
};

export const ReadyMid: Story = {
  args: {
    score: 65,
    headline: "이 분석 결과, 조건부 활용 가능",
    detail: "핵심 정책·용어는 활용 가능하나, 승인율이나 커버리지 보완이 필요. 전문가 검토 후 단계적 적용 권장.",
  },
};

export const ReadyLow: Story = {
  args: {
    score: 30,
    headline: "이 분석 결과, 추가 작업 필요",
    detail: "파이프라인 산출물의 품질 또는 커버리지가 부족. 추가 문서 투입 및 HITL 리뷰 후 재평가 필요.",
  },
};
