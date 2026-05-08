import type { Meta, StoryObj } from "@storybook/react";
import { GaugeSet } from "./GaugeSet";

const meta: Meta<typeof GaugeSet> = {
  title: "AnalysisReport/GaugeSet",
  component: GaugeSet,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof GaugeSet>;

export const Default: Story = {
  args: {
    gauges: [
      { key: "coverage", label: "정책 승인율", value: 90 },
      { key: "score", label: "활용 준비도", value: 75 },
      { key: "trust", label: "신뢰도", value: 60 },
    ],
  },
};

export const AllHigh: Story = {
  args: {
    gauges: [
      { key: "coverage", label: "정책 승인율", value: 95 },
      { key: "score", label: "활용 준비도", value: 92 },
      { key: "trust", label: "신뢰도", value: 88 },
    ],
  },
};

export const AllLow: Story = {
  args: {
    gauges: [
      { key: "coverage", label: "정책 승인율", value: 20 },
      { key: "score", label: "활용 준비도", value: 35 },
      { key: "trust", label: "신뢰도", value: 10 },
    ],
  },
};
