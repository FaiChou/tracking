"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TrackingStatus } from "@prisma/client";
import { MoreHorizontal, ExternalLink, Archive, Trash2, Search, Pencil, Check, X } from "lucide-react";

// 定义运单类型
type Tracking = {
  id: string;
  trackingNumber: string;
  status: TrackingStatus;
  note: string | null;
  isArchived: boolean;
  logisticsCompany: { id: string; name: string; color: string; trackingUrl: string } | null;
  forwarder: { id: string; name: string; color: string } | null;
};

// 定义物流公司类型
type LogisticsCompany = {
  id: string;
  name: string;
  color: string;
  trackingUrl: string;
};

// 定义货代商类型
type Forwarder = {
  id: string;
  name: string;
  color: string;
};

export default function TrackingList() {
  const searchParams = useSearchParams();
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [logisticsCompanies, setLogisticsCompanies] = useState<LogisticsCompany[]>([]);
  const [forwarders, setForwarders] = useState<Forwarder[]>([]);
  const [selectedTrackings, setSelectedTrackings] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trackingToDelete, setTrackingToDelete] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  
  // 获取运单数据
  const fetchTrackings = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = searchParams.get("status");
      const logisticsCompanyId = searchParams.get("logisticsCompanyId");
      const forwarderId = searchParams.get("forwarderId");
      
      let url = "/api/trackings?";
      if (status) url += `status=${status}&`;
      if (logisticsCompanyId) url += `logisticsCompanyId=${logisticsCompanyId}&`;
      if (forwarderId) url += `forwarderId=${forwarderId}&`;
      
      const res = await fetch(url);
      const data = await res.json();
      setTrackings(data);
    } catch (error) {
      console.error("Failed to fetch trackings:", error);
      toast.error("获取运单数据失败");
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);
  
  // 获取物流公司和货代商数据
  const fetchData = useCallback(async () => {
    try {
      const [logisticsRes, forwardersRes] = await Promise.all([
        fetch("/api/logistics-companies"),
        fetch("/api/forwarders")
      ]);
      
      const logisticsData = await logisticsRes.json();
      const forwardersData = await forwardersRes.json();
      
      setLogisticsCompanies(logisticsData);
      setForwarders(forwardersData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  }, []);
  
  // 组件加载时获取数据
  useEffect(() => {
    fetchData();
    fetchTrackings();
  }, [fetchData, fetchTrackings]);
  
  // 更新运单状态
  const updateTrackingStatus = async (id: string, status: TrackingStatus) => {
    try {
      const res = await fetch(`/api/trackings/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      
      if (res.ok) {
        setTrackings(trackings.map(tracking => 
          tracking.id === id ? { ...tracking, status } : tracking
        ));
        toast.success("状态已更新");
      } else {
        toast.error("更新状态失败");
      }
    } catch (error) {
      console.error("Failed to update tracking status:", error);
      toast.error("更新状态失败");
    }
  };
  
  // 更新物流公司
  const updateLogisticsCompany = async (id: string, logisticsCompanyId: string) => {
    try {
      const res = await fetch(`/api/trackings/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ logisticsCompanyId: logisticsCompanyId === "none" ? null : logisticsCompanyId }),
      });
      
      if (res.ok) {
        const company = logisticsCompanies.find(c => c.id === logisticsCompanyId);
        setTrackings(trackings.map(tracking => 
          tracking.id === id ? { 
            ...tracking, 
            logisticsCompany: logisticsCompanyId === "none" ? null : (company ? {
              id: company.id,
              name: company.name,
              color: company.color,
              trackingUrl: company.trackingUrl
            } : null)
          } : tracking
        ));
        toast.success("物流公司已更新");
      } else {
        toast.error("更新物流公司失败");
      }
    } catch (error) {
      console.error("Failed to update logistics company:", error);
      toast.error("更新物流公司失败");
    }
  };
  
  // 更新货代商
  const updateForwarder = async (id: string, forwarderId: string) => {
    try {
      const res = await fetch(`/api/trackings/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ forwarderId: forwarderId === "none" ? null : forwarderId }),
      });
      
      if (res.ok) {
        const forwarder = forwarders.find(f => f.id === forwarderId);
        setTrackings(trackings.map(tracking => 
          tracking.id === id ? { 
            ...tracking, 
            forwarder: forwarderId === "none" ? null : (forwarder ? {
              id: forwarder.id,
              name: forwarder.name,
              color: forwarder.color
            } : null)
          } : tracking
        ));
        toast.success("货代商已更新");
      } else {
        toast.error("更新货代商失败");
      }
    } catch (error) {
      console.error("Failed to update forwarder:", error);
      toast.error("更新货代商失败");
    }
  };
  
  // 归档运单
  const archiveTracking = async (id: string) => {
    try {
      const res = await fetch(`/api/trackings/${id}/archive`, {
        method: "POST",
      });
      
      if (res.ok) {
        setTrackings(trackings.filter(tracking => tracking.id !== id));
        toast.success("运单已归档");
      } else {
        toast.error("归档运单失败");
      }
    } catch (error) {
      console.error("Failed to archive tracking:", error);
      toast.error("归档运单失败");
    }
  };
  
  // 删除运单
  const deleteTracking = async (id: string) => {
    try {
      const res = await fetch(`/api/trackings/${id}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        setTrackings(trackings.filter(tracking => tracking.id !== id));
        toast.success("运单已删除");
      } else {
        toast.error("删除运单失败");
      }
    } catch (error) {
      console.error("Failed to delete tracking:", error);
      toast.error("删除运单失败");
    } finally {
      setDeleteDialogOpen(false);
      setTrackingToDelete(null);
    }
  };
  
  // 批量查询 17track
  const search17Track = () => {
    if (selectedTrackings.length === 0) {
      toast.error("请选择至少一个运单");
      return;
    }
    
    const trackingNumbers = selectedTrackings
      .map(id => trackings.find(t => t.id === id)?.trackingNumber)
      .filter(Boolean)
      .join(",");
    
    window.open(`https://t.17track.net/zh-cn#nums=${trackingNumbers}`, "_blank");
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
  
  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedTrackings.length === trackings.length) {
      setSelectedTrackings([]);
    } else {
      setSelectedTrackings(trackings.map(t => t.id));
    }
  };
  
  // 选择单个运单
  const toggleSelect = (id: string) => {
    if (selectedTrackings.includes(id)) {
      setSelectedTrackings(selectedTrackings.filter(t => t !== id));
    } else {
      setSelectedTrackings([...selectedTrackings, id]);
    }
  };
  
  // 更新备注
  const updateNote = async (id: string, note: string) => {
    try {
      const res = await fetch(`/api/trackings/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note }),
      });
      
      if (res.ok) {
        setTrackings(trackings.map(tracking => 
          tracking.id === id ? { ...tracking, note } : tracking
        ));
        toast.success("备注已更新");
      } else {
        toast.error("更新备注失败");
      }
    } catch (error) {
      console.error("Failed to update note:", error);
      toast.error("更新备注失败");
    } finally {
      setEditingNote(null);
    }
  };
  
  // 开始编辑备注
  const startEditingNote = (id: string, currentNote: string | null) => {
    setEditingNote(id);
    setNoteValue(currentNote || "");
  };
  
  // 取消编辑备注
  const cancelEditingNote = () => {
    setEditingNote(null);
  };
  
  if (isLoading) {
    return <div className="text-center py-8">加载中...</div>;
  }
  
  if (trackings.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">暂无运单数据</p>
        <Button asChild>
          <Link href="/add">添加运单</Link>
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {selectedTrackings.length > 0 && (
        <div className="flex items-center justify-between bg-muted p-2 rounded-md">
          <span>已选择 {selectedTrackings.length} 个运单</span>
          <Button onClick={search17Track} size="sm">
            <Search className="h-4 w-4 mr-2" />
            17Track 批量查询
          </Button>
        </div>
      )}
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox 
                  checked={selectedTrackings.length === trackings.length && trackings.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>运单号</TableHead>
              <TableHead>物流公司</TableHead>
              <TableHead>货代商</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trackings.map((tracking) => (
              <TableRow key={tracking.id} className="group">
                <TableCell>
                  <Checkbox 
                    checked={selectedTrackings.includes(tracking.id)}
                    onCheckedChange={() => toggleSelect(tracking.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{tracking.trackingNumber}</TableCell>
                <TableCell>
                  <Select
                    value={tracking.logisticsCompany?.id || "none"}
                    onValueChange={(value) => updateLogisticsCompany(tracking.id, value)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="选择物流公司" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无</SelectItem>
                      {logisticsCompanies.map((company) => (
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
                </TableCell>
                <TableCell>
                  <Select
                    value={tracking.forwarder?.id || "none"}
                    onValueChange={(value) => updateForwarder(tracking.id, value)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="选择货代商" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无</SelectItem>
                      {forwarders.map((forwarder) => (
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
                </TableCell>
                <TableCell>
                  <Select
                    value={tracking.status}
                    onValueChange={(value) => updateTrackingStatus(tracking.id, value as TrackingStatus)}
                  >
                    <SelectTrigger className={`w-[120px] ${getStatusColor(tracking.status)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TrackingStatus.PENDING}>待处理</SelectItem>
                      <SelectItem value={TrackingStatus.TRANSIT}>运输中</SelectItem>
                      <SelectItem value={TrackingStatus.DELIVERED}>已签收</SelectItem>
                      <SelectItem value={TrackingStatus.EXCEPTION}>物流异常</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {editingNote === tracking.id ? (
                    <div className="flex items-center space-x-2">
                      <Input
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateNote(tracking.id, noteValue)}
                        className="h-8 w-8"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={cancelEditingNote}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span>{tracking.note || "-"}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditingNote(tracking.id, tracking.note)}
                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
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
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => archiveTracking(tracking.id)}>
                          <Archive className="h-4 w-4 mr-2" />
                          归档
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            setTrackingToDelete(tracking.id);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除这个运单吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => trackingToDelete && deleteTracking(trackingToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 