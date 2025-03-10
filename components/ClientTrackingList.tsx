"use client";

import { useSearchParams } from "next/navigation";
import TrackingList from "./TrackingList";

export default function ClientTrackingList() {
  const searchParams = useSearchParams();
  
  // 从 URL 参数中提取过滤条件
  const status = searchParams.get("status");
  const logisticsCompanyId = searchParams.get("logisticsCompanyId");
  const forwarderId = searchParams.get("forwarderId");
  
  // 构建 API URL
  let apiUrl = "/api/trackings?";
  if (status) apiUrl += `status=${status}&`;
  if (logisticsCompanyId) apiUrl += `logisticsCompanyId=${logisticsCompanyId}&`;
  if (forwarderId) apiUrl += `forwarderId=${forwarderId}&`;
  
  return <TrackingList apiUrl={apiUrl} />;
} 