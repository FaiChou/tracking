"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TrackingStatus } from "@prisma/client";
import { Flame } from "lucide-react";

export default function ClientTrackingFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [logisticsCompanyId, setLogisticsCompanyId] = useState(searchParams.get("logisticsCompanyId") || "all");
  const [forwarderId, setForwarderId] = useState(searchParams.get("forwarderId") || "all");
  const [isUrgentOnly, setIsUrgentOnly] = useState(searchParams.get("isUrgent") === "true");
  const [logisticsCompanies, setLogisticsCompanies] = useState<{ id: string; name: string; color: string }[]>([]);
  const [forwarders, setForwarders] = useState<{ id: string; name: string; color: string }[]>([]);
  
  // 添加统计数据状态
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  
  // 获取物流公司和货代商数据
  useEffect(() => {
    // 获取物流公司列表
    fetch("/api/logistics-companies")
      .then(res => res.json())
      .then(data => setLogisticsCompanies(data))
      .catch(err => console.error("Failed to fetch logistics companies:", err));
    
    // 获取货代商列表
    fetch("/api/forwarders")
      .then(res => res.json())
      .then(data => setForwarders(data))
      .catch(err => console.error("Failed to fetch forwarders:", err));
  }, []);
  
  // 监听统计数据更新事件
  useEffect(() => {
    const handleCountsUpdate = (event: CustomEvent) => {
      const { total, filtered } = event.detail;
      setTotalCount(total);
      setFilteredCount(filtered);
    };
    
    window.addEventListener("tracking:counts", handleCountsUpdate as EventListener);
    
    return () => {
      window.removeEventListener("tracking:counts", handleCountsUpdate as EventListener);
    };
  }, []);
  
  // 应用过滤条件
  const applyFilters = (newStatus?: string, newLogisticsCompanyId?: string, newForwarderId?: string, newIsUrgent?: boolean) => {
    const params = new URLSearchParams();
    
    const statusToApply = newStatus !== undefined ? newStatus : status;
    const logisticsCompanyIdToApply = newLogisticsCompanyId !== undefined ? newLogisticsCompanyId : logisticsCompanyId;
    const forwarderIdToApply = newForwarderId !== undefined ? newForwarderId : forwarderId;
    const isUrgentToApply = newIsUrgent !== undefined ? newIsUrgent : isUrgentOnly;
    
    if (statusToApply && statusToApply !== "all") params.set("status", statusToApply);
    if (logisticsCompanyIdToApply && logisticsCompanyIdToApply !== "all") params.set("logisticsCompanyId", logisticsCompanyIdToApply);
    if (forwarderIdToApply && forwarderIdToApply !== "all") params.set("forwarderId", forwarderIdToApply);
    if (isUrgentToApply) params.set("isUrgent", "true");
    
    router.push(`/?${params.toString()}`);
  };
  
  // 处理状态变化
  const handleStatusChange = (value: string) => {
    setStatus(value);
    applyFilters(value);
  };
  
  // 处理物流公司变化
  const handleLogisticsCompanyChange = (value: string) => {
    setLogisticsCompanyId(value);
    applyFilters(undefined, value);
  };
  
  // 处理货代商变化
  const handleForwarderChange = (value: string) => {
    setForwarderId(value);
    applyFilters(undefined, undefined, value);
  };
  
  // 处理加急状态变化
  const handleUrgentChange = () => {
    const newIsUrgent = !isUrgentOnly;
    setIsUrgentOnly(newIsUrgent);
    applyFilters(undefined, undefined, undefined, newIsUrgent);
  };
  
  // 清除过滤条件
  const clearFilters = () => {
    setStatus("all");
    setLogisticsCompanyId("all");
    setForwarderId("all");
    setIsUrgentOnly(false);
    router.push("/");
  };
  
  // 计算过滤状态文本
  const getFilterStatusText = () => {
    if (filteredCount === totalCount) {
      return `共 ${totalCount} 条运单`;
    }
    return `显示 ${filteredCount} / ${totalCount} 条运单`;
  };
  
  // 获取状态颜色
  const getStatusColor = (status: TrackingStatus) => {
    switch (status) {
      case "DELIVERED":
        return "text-green-600";
      case "TRANSIT":
        return "text-blue-600";
      case "EXCEPTION":
        return "text-red-600";
      default:
        return "";
    }
  };
  
  return (
    <div className="bg-card p-3 rounded-lg border flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium whitespace-nowrap">状态:</span>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="选择状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value={TrackingStatus.PENDING} className="">
              待处理
            </SelectItem>
            <SelectItem value={TrackingStatus.TRANSIT} className={getStatusColor(TrackingStatus.TRANSIT)}>
              运输中
            </SelectItem>
            <SelectItem value={TrackingStatus.DELIVERED} className={getStatusColor(TrackingStatus.DELIVERED)}>
              已签收
            </SelectItem>
            <SelectItem value={TrackingStatus.EXCEPTION} className={getStatusColor(TrackingStatus.EXCEPTION)}>
              异常
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium whitespace-nowrap">物流公司:</span>
        <Select value={logisticsCompanyId} onValueChange={handleLogisticsCompanyChange}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="选择物流公司" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部物流公司</SelectItem>
            {logisticsCompanies.map(company => (
              <SelectItem key={company.id} value={company.id}>
                <div className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: company.color }}
                  />
                  {company.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium whitespace-nowrap">货代商:</span>
        <Select value={forwarderId} onValueChange={handleForwarderChange}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="选择货代商" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部货代商</SelectItem>
            {forwarders.map(forwarder => (
              <SelectItem key={forwarder.id} value={forwarder.id}>
                <div className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: forwarder.color }}
                  />
                  {forwarder.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={isUrgentOnly ? "default" : "outline"}
          size="sm"
          onClick={handleUrgentChange}
          className="h-9"
        >
          <Flame className={"h-4 w-4 mr-2 text-red-500"} />
          仅看加急
        </Button>
      </div>
      
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-sm text-muted-foreground">
          {getFilterStatusText()}
        </span>
        <Button variant="outline" size="sm" onClick={clearFilters}>
          重置过滤
        </Button>
      </div>
    </div>
  );
} 