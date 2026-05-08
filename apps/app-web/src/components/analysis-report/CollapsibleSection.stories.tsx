import type { Meta, StoryObj } from "@storybook/react";
import { BarChart2 } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection";

const meta: Meta<typeof CollapsibleSection> = {
  title: "AnalysisReport/CollapsibleSection",
  component: CollapsibleSection,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CollapsibleSection>;

const content = (
  <p className="text-sm text-gray-600">접기/펼치기 섹션 콘텐츠 영역입니다.</p>
);

export const DefaultClosed: Story = {
  args: {
    icon: BarChart2,
    title: "파이프라인 현황",
    subtitle: "5-Stage Core Engine 실행 결과 요약",
    defaultOpen: false,
    children: content,
  },
};

export const DefaultOpen: Story = {
  args: {
    icon: BarChart2,
    title: "파이프라인 현황",
    subtitle: "5-Stage Core Engine 실행 결과 요약",
    defaultOpen: true,
    children: content,
  },
};
