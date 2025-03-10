import { Suspense } from "react";
import ClientTrackingList from "@/components/ClientTrackingList";
import ClientTrackingFilters from "@/components/ClientTrackingFilters";
import AddTrackingDialog from "@/components/AddTrackingDialog";

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">运单管理</h1>
        <AddTrackingDialog />
      </div>
      
      <Suspense fallback={<div className="bg-card p-3 rounded-lg border">加载过滤条件中...</div>}>
        <ClientTrackingFilters />
      </Suspense>
      
      <Suspense fallback={<div>加载中...</div>}>
        <ClientTrackingList />
      </Suspense>
    </div>
  );
}
