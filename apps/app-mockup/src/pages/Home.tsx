import { useState } from "react";
import { MockupHeader } from "@/components/shared/MockupHeader";
import { PolicyEngineDemo } from "@/components/demo/policy/PolicyEngineDemo";
import { SkillInvokerDemo } from "@/components/demo/skill/SkillInvokerDemo";
import { OntologyExplorerDemo } from "@/components/demo/ontology/OntologyExplorerDemo";
import { DeliverablePreviewDemo } from "@/components/demo/deliverable/DeliverablePreviewDemo";
import { useDomain } from "@/contexts/DomainContext";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "policy", label: "정책 엔진", emoji: "📋" },
  { id: "skill", label: "Skill 호출", emoji: "🔧" },
  { id: "ontology", label: "온톨로지", emoji: "🌐" },
  { id: "deliverable", label: "산출물", emoji: "📄" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const { domain } = useDomain();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <MockupHeader />

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
              )}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content — placeholder for workers to fill */}
        <div key={`${domain.id}-${activeTab}`}>
          {activeTab === "policy" && (
            <div id="demo-policy">
              <PolicyEngineDemo />
            </div>
          )}
          {activeTab === "skill" && (
            <div id="demo-skill">
              <SkillInvokerDemo />
            </div>
          )}
          {activeTab === "ontology" && (
            <div id="demo-ontology">
              <OntologyExplorerDemo />
            </div>
          )}
          {activeTab === "deliverable" && (
            <div id="demo-deliverable">
              <DeliverablePreviewDemo />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
