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
import TrackingHistoryButton from "@/components/TrackingHistoryButton";
import { toast } from "sonner";
import { TrackingStatus } from "@prisma/client";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type Tracking = {
  id: string;
  trackingNumber: string;
  status: TrackingStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  logisticsCompany: { id: string; name: string; color: string; trackingUrl: string } | null;
  forwarder: { id: string; name: string; color: string } | null;
};

type SortField = "status" | "createdAt" | "updatedAt";
type SortOrder = "asc" | "desc";

export default function ArchivedPage() {
  const [archivedTrackings, setArchivedTrackings] = useState<Tracking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  
  // 排序状态
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  
  // 获取归档运单
  const fetchArchivedTrackings = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/trackings/archived");
      if (!res.ok) throw new Error("获取归档运单失败");
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("归档运单数据格式错误");
      setArchivedTrackings(data);
    } catch (error) {
      console.error("Failed to fetch archived trackings:", error);
      setLoadError(true);
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
        return "异常";
      default:
        return "未知";
    }
  };
  
  // 切换排序
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      // 如果已经按此字段排序，则切换排序顺序
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // 如果是新字段，则设置为此字段并默认降序
      setSortField(field);
      setSortOrder("desc");
    }
  };
  // 获取排序图标
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1" />;
    return sortOrder === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />;
  };
  
  // 排序运单
  const sortedTrackings = [...archivedTrackings].sort((a, b) => {
    if (sortField === "status") {
      // 状态排序
      const statusOrder = { PENDING: 0, TRANSIT: 1, DELIVERED: 2, EXCEPTION: 3 };
      const aValue = statusOrder[a.status] || 0;
      const bValue = statusOrder[b.status] || 0;
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    } else if (sortField === "createdAt") {
      // 创建日期排序
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    } else if (sortField === "updatedAt") {
      // 更新日期排序
      const aDate = new Date(a.updatedAt).getTime();
      const bDate = new Date(b.updatedAt).getTime();
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    }
    return 0;
  });
  
  const errorNotice = loadError && (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">
        获取归档运单失败。{archivedTrackings.length > 0 ? "当前保留上次加载的数据。" : "请重试。"}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => void fetchArchivedTrackings()}>重试加载归档运单</Button>
    </div>
  );

  if (isLoading && archivedTrackings.length === 0) {
    return <div className="text-center py-8">加载中...</div>;
  }
  
  if (archivedTrackings.length === 0) {
    return (
      <div className="space-y-4">
        {errorNotice}
        {!loadError && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">暂无归档运单</p>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {errorNotice}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-9">运单号</TableHead>
              <TableHead className="h-9">物流公司</TableHead>
              <TableHead className="h-9">货代商</TableHead>
              <TableHead className="h-9">
                <div
                  className="font-semibold cursor-pointer flex items-center"
                  onClick={() => toggleSort("status")}
                >
                  状态{getSortIcon("status")}
                </div>
              </TableHead>
              <TableHead className="h-9 w-[240px] max-w-[240px]">备注</TableHead>
              <TableHead className="h-9">
                <div
                  className="font-semibold cursor-pointer flex items-center"
                  onClick={() => toggleSort("createdAt")}
                >
                  添加日期{getSortIcon("createdAt")}
                </div>
              </TableHead>
              <TableHead className="h-9">
                <div
                  className="font-semibold cursor-pointer flex items-center"
                  onClick={() => toggleSort("updatedAt")}
                >
                  更新日期{getSortIcon("updatedAt")}
                </div>
              </TableHead>
              <TableHead className="h-9 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTrackings.map((tracking) => (
              <TableRow key={tracking.id}>
                <TableCell className="py-1 font-medium">{tracking.trackingNumber}</TableCell>
                <TableCell className="py-1">
                  {tracking.logisticsCompany ? (
                    <div className="flex items-center">
                      <div 
                        className="w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" 
                        style={{ backgroundColor: tracking.logisticsCompany.color }}
                      />
                      {tracking.logisticsCompany.name}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="py-1">
                  {tracking.forwarder ? (
                    <div className="flex items-center">
                      <div 
                        className="w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" 
                        style={{ backgroundColor: tracking.forwarder.color }}
                      />
                      {tracking.forwarder.name}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className={`py-1 ${getStatusColor(tracking.status)}`}>
                  {getStatusText(tracking.status)}
                </TableCell>
                <TableCell className="py-1 w-[240px] max-w-[240px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {tracking.note || "-"}
                </TableCell>
                <TableCell className="py-1 text-xs text-muted-foreground">
                  {new Date(tracking.createdAt).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </TableCell>
                <TableCell className="py-1 text-xs text-muted-foreground">
                  {new Date(tracking.updatedAt).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </TableCell>
                <TableCell className="py-1 text-right">
                  <div className="flex justify-end items-center space-x-1.5">
                    <TrackingHistoryButton
                      trackingId={tracking.id}
                      trackingNumber={tracking.trackingNumber}
                      trackingUrl={tracking.logisticsCompany?.trackingUrl}
                      onSynced={({ status }) => {
                        setArchivedTrackings(current =>
                          current.map(item =>
                            item.id === tracking.id
                              ? { ...item, status, updatedAt: new Date().toISOString() }
                              : item
                          )
                        );
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
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
      <p className="text-right text-sm text-muted-foreground">已显示 {archivedTrackings.length} 条归档记录（最多 500 条）</p>
    </div>
  );
}
