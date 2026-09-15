import { useState } from 'react';
import Masthead from './components/Masthead';
import CategoryTabs from './components/CategoryTabs';
import ReportView from './components/ReportView';
import Footer from './components/Footer';
import { categories } from './data/categories';

export default function App() {
  const [activeId, setActiveId] = useState(categories[0].id);
  const active = categories.find((c) => c.id === activeId) ?? categories[0];

  return (
    <div className="layout">
      <Masthead />
      <CategoryTabs items={categories} activeId={activeId} onSelect={setActiveId} />
      <main>
        <ReportView category={active} />
      </main>
      <Footer />
    </div>
  );
}
