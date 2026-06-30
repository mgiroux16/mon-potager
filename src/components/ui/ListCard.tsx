import type { ReactNode } from 'react'

export function ListCard<T>({
  items,
  renderItem,
  emptyMessage,
  header,
}: {
  items: T[]
  renderItem: (item: T) => ReactNode
  emptyMessage: string
  header?: ReactNode
}) {
  if (items.length === 0) {
    return <p className="text-body text-gray-500">{emptyMessage}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {header}
      <ul className="flex flex-col gap-1.5">{items.map(renderItem)}</ul>
    </div>
  )
}
