import styles from './TabBar.module.css';

export type TabId = 'groups' | 'dealers' | 'all';

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
  allDealerCount?: number;
}

export function TabBar({ activeTab, onTabChange, groupCount, dealerCount, allDealerCount }: TabBarProps) {
  const tabs: Tab[] = [
    { id: 'groups', label: 'Dealer Groups', count: groupCount },
    { id: 'dealers', label: 'Independent Dealers', count: dealerCount },
    { id: 'all', label: 'All Dealers', count: allDealerCount },
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
