import type { Meta, StoryObj } from "@storybook/react";
import { ScoreGauge } from "./ScoreGauge";

const meta: Meta<typeof ScoreGauge> = {
  title: "AnalysisReport/ScoreGauge",
  component: ScoreGauge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ScoreGauge>;

export const Default: Story = {
  args: { score: 75, label: "활용 준비도" },
};

export const High: Story = {
  args: { score: 95, label: "활용 준비도" },
};

export const Low: Story = {
  args: { score: 30, label: "활용 준비도" },
};
