import { Fragment } from 'react'

export interface Crumb {
  label: string
  /** Presente nos níveis anteriores (clicáveis). O último nível (página atual) não tem. */
  onClick?: () => void
}

/**
 * Trilha de navegação ("Lançamentos › Novo lançamento").
 * O último item é a página atual (`aria-current="page"`); os anteriores são botões que voltam
 * ao nível correspondente.
 */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="breadcrumbs">
      <ol>
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <Fragment key={`${i}-${item.label}`}>
              <li>
                {isLast || !item.onClick ? (
                  <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
                ) : (
                  <button type="button" className="breadcrumbs-link" onClick={item.onClick}>
                    {item.label}
                  </button>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" className="breadcrumbs-sep">
                  ›
                </li>
              )}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
