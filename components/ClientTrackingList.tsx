"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import TrackingList from "./TrackingList";

export default function ClientTrackingList() {
  const searchParams = useSearchParams();
  // 添加刷新计数器状态
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // 从 URL 参数中提取过滤条件
  const status = searchParams.get("status");
  const logisticsCompanyId = searchParams.get("logisticsCompanyId");
  const forwarderId = searchParams.get("forwarderId");
  
  // 构建 API URL
  let apiUrl = "/api/trackings?";
  if (status) apiUrl += `status=${status}&`;
  if (logisticsCompanyId) apiUrl += `logisticsCompanyId=${logisticsCompanyId}&`;
  if (forwarderId) apiUrl += `forwarderId=${forwarderId}&`;
  
  // 添加刷新函数
  const refreshList = () => {
    setRefreshCounter(prev => prev + 1);
  };
  
  // 监听添加运单事件
  useEffect(() => {
    // 添加自定义事件监听器
    window.addEventListener("tracking:added", refreshList);
    
    // 清理函数
    return () => {
      window.removeEventListener("tracking:added", refreshList);
    };
  }, []);
  
  // 更新统计数据的回调函数
  const updateCounts = (total: number, filtered: number) => {
    // 触发自定义事件，通知过滤器组件更新统计数据
    window.dispatchEvent(new CustomEvent("tracking:counts", { 
      detail: { total, filtered } 
    }));
  };
  
  return <TrackingList 
    apiUrl={apiUrl} 
    refreshCounter={refreshCounter} 
    onCountsUpdate={updateCounts}
  />;
} 