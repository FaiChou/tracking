"use client";

import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TrackingStatus } from "@prisma/client";
import { ExternalLink } from "lucide-react";

type Tracking = {
  id: string;
  trackingNumber: string;
  status: TrackingStatus;
  note: string | null;
  logisticsCompany: { id: string; name: string; color: string; trackingUrl: string } | null;
  forwarder: { id: string; name: string; color: string } | null;
};

export default function ArchivedPage() {
  const [archivedTrackings, setArchivedTrackings] = useState<Tracking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 获取归档运单
  const fetchArchivedTrackings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/trackings/archived");
      const data = await res.json();
      setArchivedTrackings(data);
    } catch (error) {
      console.error("Failed to fetch archived trackings:", error);
      toast.error("获取归档运单失败");
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchArchivedTrackings();
  }, []);
  
  // 取消归档
  const unarchiveTracking = async (id: string) => {
    try {
      const res = await fetch(`/api/trackings/${id}/unarchive`, {
        method: "POST",
      });
      
      if (res.ok) {
        setArchivedTrackings(archivedTrackings.filter(tracking => tracking.id !== id));
        toast.success("已取消归档");
      } else {
        toast.error("取消归档失败");
      }
    } catch (error) {
      console.error("Failed to unarchive tracking:", error);
      toast.error("取消归档失败");
    }
  };
  
  // 官网查询
  const searchOfficial = (tracking: Tracking) => {
    if (!tracking.logisticsCompany?.trackingUrl) {
      toast.error("未设置物流公司或查询网址");
      return;
    }
    
    window.open(`${tracking.logisticsCompany.trackingUrl}${tracking.trackingNumber}`, "_blank");
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
  
  // 获取状态文本
  const getStatusText = (status: TrackingStatus) => {
    switch (status) {
      case "PENDING":
        return "待处理";
      case "TRANSIT":
        return "运输中";
      case "DELIVERED":
        return "已签收";
      case "EXCEPTION":
        return "物流异常";
      default:
        return "未知";
    }
  };
  
  if (isLoading) {
    return <div className="text-center py-8">加载中...</div>;
  }
  
  if (archivedTrackings.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">归档运单</h1>
        <div className="text-center py-8">
          <p className="text-muted-foreground">暂无归档运单</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">归档运单</h1>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>运单号</TableHead>
              <TableHead>物流公司</TableHead>
              <TableHead>货代商</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {archivedTrackings.map((tracking) => (
              <TableRow key={tracking.id}>
                <TableCell className="font-medium">{tracking.trackingNumber}</TableCell>
                <TableCell>
                  {tracking.logisticsCompany ? (
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{ backgroundColor: tracking.logisticsCompany.color }}
                      />
                      {tracking.logisticsCompany.name}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  {tracking.forwarder ? (
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{ backgroundColor: tracking.forwarder.color }}
                      />
                      {tracking.forwarder.name}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className={getStatusColor(tracking.status)}>
                  {getStatusText(tracking.status)}
                </TableCell>
                <TableCell>{tracking.note || "-"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end items-center space-x-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => searchOfficial(tracking)}
                      disabled={!tracking.logisticsCompany?.trackingUrl}
                      title="官网查询"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unarchiveTracking(tracking.id)}
                    >
                      取消归档
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 