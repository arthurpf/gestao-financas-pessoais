export type Page = 'dashboard' | 'transactions' | 'import-export' | 'credit-cards' | 'labels' | 'settings'

interface MenuItem {
  id: Page
  label: string
  icon: string
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'transactions', label: 'Lançamentos', icon: '🧾' },
  { id: 'import-export', label: 'Importar/Exportar', icon: '🔄' },
  { id: 'credit-cards', label: 'Cartões de Crédito', icon: '💳' },
  { id: 'labels', label: 'Etiquetas', icon: '🏷️' },
  { id: 'settings', label: 'Configurações', icon: '⚙️' }
]

interface SidebarProps {
  current: Page
  onNavigate: (page: Page) => void
}

export default function Sidebar({ current, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span aria-hidden="true">💰</span>
        <span>Gestão de Finanças Pessoais</span>
      </div>

      <nav aria-label="Menu principal" className="sidebar-nav">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            className="sidebar-item"
            onClick={() => onNavigate(item.id)}
            aria-current={current === item.id ? 'page' : undefined}
          >
            <span className="sidebar-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
