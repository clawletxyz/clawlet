import { LayoutDashboard, ScrollText, ArrowLeftRight, Settings } from "lucide-react";

export type TabId = "overview" | "rules" | "transactions" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: "rules", label: "Rules", icon: <ScrollText className="h-3.5 w-3.5" /> },
  { id: "transactions", label: "Transactions", icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-3.5 w-3.5" /> },
];

interface TabBarProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function TabBar({ activeTab, onChange }: TabBarProps) {
  return (
    <div
      className="sticky top-14 z-30 mb-6 inline-flex rounded-full bg-[#F2F2F2] p-[3px] overflow-x-auto scrollbar-hide"
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2 text-xs font-medium transition-all duration-150 rounded-full active:scale-[0.98] cursor-pointer ${
            activeTab === tab.id
              ? "bg-white font-semibold text-[#111111]"
              : "text-[#888888] hover:text-[#111111]"
          }`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
