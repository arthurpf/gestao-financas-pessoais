import type { ReactNode } from 'react'
import Breadcrumbs, { type Crumb } from './Breadcrumbs'

/**
 * Cabeçalho padrão de página.
 *
 * - Em páginas raiz, passe só `title` (e `actions`, se houver).
 * - Em subtelas (formulário, detalhe...), passe `breadcrumbs` com a trilha completa, do nível
 *   raiz até a tela atual. O botão "Voltar" e a trilha aparecem juntos, e "Voltar" leva ao
 *   penúltimo nível. O título costuma ser o texto do último item.
 */
export default function PageHeader({
  title,
  breadcrumbs,
  actions
}: {
  title: string
  breadcrumbs?: Crumb[]
  actions?: ReactNode
}) {
  const parent = breadcrumbs && breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null

  return (
    <header className="page-header">
      <div className="page-header-main">
        {breadcrumbs && breadcrumbs.length > 1 && (
          <div className="page-header-nav">
            {parent?.onClick && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={parent.onClick}>
                &larr; Voltar
              </button>
            )}
            <Breadcrumbs items={breadcrumbs} />
          </div>
        )}
        <h2>{title}</h2>
      </div>
      {actions && <div className="toolbar-group">{actions}</div>}
    </header>
  )
}
