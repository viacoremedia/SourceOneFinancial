import styles from './TabBar.module.css';

export type TabId = 'groups' | 'dealers';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  groupCount?: number;
  dealerCount?: number;
}

export function TabBar({ activeTab, onTabChange, groupCount, dealerCount }: TabBarProps) {
  const tabs: Tab[] = [
    { id: 'groups', label: 'Dealer Groups', count: groupCount },
    { id: 'dealers', label: 'Independent Dealers', count: dealerCount },
  ];

  return (
    <div className={styles.tabBar} role="tablist" id="dealer-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.count != null && (
            <span className={styles.tabCount}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
