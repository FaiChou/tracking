"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TrackingStatus } from "@prisma/client";

export default function TrackingFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [logisticsCompanies, setLogisticsCompanies] = useState<{ id: string; name: string }[]>([]);
  const [forwarders, setForwarders] = useState<{ id: string; name: string }[]>([]);
  
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [logisticsCompanyId, setLogisticsCompanyId] = useState(searchParams.get("logisticsCompanyId") || "all");
  const [forwarderId, setForwarderId] = useState(searchParams.get("forwarderId") || "all");
  
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
  
  const applyFilters = () => {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (logisticsCompanyId && logisticsCompanyId !== "all") params.set("logisticsCompanyId", logisticsCompanyId);
    if (forwarderId && forwarderId !== "all") params.set("forwarderId", forwarderId);
    
    router.push(`/?${params.toString()}`);
  };
  
  const clearFilters = () => {
    setStatus("all");
    setLogisticsCompanyId("all");
    setForwarderId("all");
    router.push("/");
  };
  
  return (
    <div className="bg-card p-3 rounded-lg border flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium whitespace-nowrap">状态:</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="选择状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value={TrackingStatus.PENDING}>待处理</SelectItem>
            <SelectItem value={TrackingStatus.TRANSIT}>运输中</SelectItem>
            <SelectItem value={TrackingStatus.DELIVERED}>已签收</SelectItem>
            <SelectItem value={TrackingStatus.EXCEPTION}>物流异常</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium whitespace-nowrap">物流公司:</span>
        <Select value={logisticsCompanyId} onValueChange={setLogisticsCompanyId}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="选择物流公司" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部物流公司</SelectItem>
            {logisticsCompanies.map(company => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium whitespace-nowrap">货代商:</span>
        <Select value={forwarderId} onValueChange={setForwarderId}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="选择货代商" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部货代商</SelectItem>
            {forwarders.map(forwarder => (
              <SelectItem key={forwarder.id} value={forwarder.id}>
                {forwarder.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="outline" size="sm" onClick={clearFilters}>
          清除
        </Button>
        <Button size="sm" onClick={applyFilters}>
          应用
        </Button>
      </div>
    </div>
  );
} 