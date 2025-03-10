import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import TrackingList from "@/components/TrackingList";
import TrackingFilters from "@/components/TrackingFilters";
import AddTrackingDialog from "@/components/AddTrackingDialog";

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">运单管理</h1>
        <AddTrackingDialog />
      </div>
      
      <TrackingFilters />
      
      <Suspense fallback={<div>加载中...</div>}>
        <TrackingList />
      </Suspense>
    </div>
  );
}
