import { useEffect, useState, useCallback } from 'react'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import ImportExport from './pages/ImportExport'
import CreditCards from './pages/CreditCards'
import Labels from './pages/Labels'
import Settings from './pages/Settings'
import Sidebar,{ type Page } from './components/Sidebar'
import type { Account, CreditCard } from './types/ipc'

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const loadAccounts = useCallback(async () => {
    let list = await window.api.accounts.list()
    if (list.length === 0) {
      await window.api.accounts.create({ name: 'Conta Principal', type: 'checking' })
      list = await window.api.accounts.list()
    }
    setAccounts(list)
  }, [])

  const loadCreditCards = useCallback(async () => {
    setCreditCards(await window.api.creditCards.list())
  }, [])

  useEffect(() => {
    loadAccounts()
    loadCreditCards()
  }, [loadAccounts, loadCreditCards])

  return (
    <div className="app">
      <Sidebar current={page} onNavigate={setPage} />

      <main className="app-main">
        <div className="app-content">
          {page === 'dashboard' && <Dashboard refreshKey={refreshKey} />}
          {page === 'transactions' && (
            <Transactions
              accounts={accounts}
              creditCards={creditCards}
              refreshKey={refreshKey}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          )}
          {page === 'import-export' && (
            <ImportExport
              accounts={accounts}
              creditCards={creditCards}
              onImported={() => setRefreshKey((k) => k + 1)}
              onRestored={async () => {
                await Promise.all([loadAccounts(), loadCreditCards()])
                setRefreshKey((k) => k + 1)
              }}
            />
          )}
          {page === 'credit-cards' && (
            <CreditCards
              accounts={accounts}
              onChanged={() => {
                setRefreshKey((k) => k + 1)
                loadCreditCards()
              }}
            />
          )}
          {page === 'labels' && <Labels onChanged={() => setRefreshKey((k) => k + 1)} />}
          {page === 'settings' && (
            <Settings
              onDataReset={async () => {
                await Promise.all([loadAccounts(), loadCreditCards()])
                setRefreshKey((k) => k + 1)
              }}
            />
          )}
        </div>
      </main>
    </div>
  )
}
