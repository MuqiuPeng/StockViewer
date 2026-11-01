import StockViewer from '@/components/StockViewer';

export default function ViewerPage() {
  return (
    <main className="h-[calc(100vh-56px)] bg-white dark:bg-gray-900 overflow-hidden">
      <StockViewer />
    </main>
  );
}

