export default function CategoryTabs({ items, activeId, onSelect }) {
  return (
    <nav className="categories">
      <div className="shell">
        <div className="categories__list" role="tablist" aria-label="تصنيفات التقارير">
          {items.map((item) => (
            <button
              key={item.id}
              className="categories__item"
              role="tab"
              type="button"
              aria-selected={item.id === activeId}
              onClick={() => onSelect(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
