import { Suspense } from "react";
import ClientTrackingList from "@/components/ClientTrackingList";
import ClientTrackingFilters from "@/components/ClientTrackingFilters";

export default function Home() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="bg-card p-3 rounded-lg border">加载过滤条件中...</div>}>
        <ClientTrackingFilters />
      </Suspense>
      
      <Suspense fallback={<div>加载中...</div>}>
        <ClientTrackingList />
      </Suspense>
    </div>
  );
}
