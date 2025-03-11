"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ExternalLink, Archive, Trash2, Search, Pencil, Check, X, ArrowUpDown, ArrowUp, ArrowDown, Copy } from "lucide-react";

// 定义运单类型
type Tracking = {
  id: string;
  trackingNumber: string;
  status: TrackingStatus;
  note: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
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

// 定义组件属性
interface TrackingListProps {
  apiUrl?: string;
  refreshCounter?: number;
  onCountsUpdate?: (total: number, filtered: number) => void;
}

type SortField = "status" | "createdAt";
type SortOrder = "asc" | "desc";

export default function TrackingList({ 
  apiUrl = "/api/trackings?", 
  refreshCounter = 0,
  onCountsUpdate
}: TrackingListProps) {
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [logisticsCompanies, setLogisticsCompanies] = useState<LogisticsCompany[]>([]);
  const [forwarders, setForwarders] = useState<Forwarder[]>([]);
  const [selectedTrackings, setSelectedTrackings] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trackingToDelete, setTrackingToDelete] = useState<string | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  
  // 排序状态
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  
  // 获取运单数据
  const fetchTrackings = useCallback(async () => {
    setIsLoading(true);
    try {
      // 获取总数据量
      const totalRes = await fetch("/api/trackings/count");
      const totalData = await totalRes.json();
      const totalCount = totalData.count;
      
      // 获取过滤后的数据
      const res = await fetch(apiUrl);
      const data = await res.json();
      setTrackings(data);
      
      // 更新统计数据
      if (onCountsUpdate) {
        onCountsUpdate(totalCount, data.length);
      }
    } catch (error) {
      console.error("Failed to fetch trackings:", error);
      toast.error("获取运单数据失败");
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, onCountsUpdate]);
  
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
  }, [fetchData, fetchTrackings, refreshCounter]);
  
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
  
  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedTrackings.length === trackings.length) {
      setSelectedTrackings([]);
    } else {
      // 使用sortedTrackings而不是trackings，确保选择顺序与显示顺序一致
      setSelectedTrackings(sortedTrackings.map(t => t.id));
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
  const sortedTrackings = [...trackings].sort((a, b) => {
    if (sortField === "status") {
      // 状态排序
      const statusOrder = { PENDING: 0, TRANSIT: 1, DELIVERED: 2, EXCEPTION: 3 };
      const aValue = statusOrder[a.status] || 0;
      const bValue = statusOrder[b.status] || 0;
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    } else if (sortField === "createdAt") {
      // 日期排序
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    }
    return 0;
  });
  
  // 批量删除运单
  const batchDeleteTrackings = async () => {
    if (selectedTrackings.length === 0) {
      toast.error("请选择至少一个运单");
      return;
    }
    
    try {
      // 使用Promise.all并行处理所有删除请求
      await Promise.all(
        selectedTrackings.map(id => 
          fetch(`/api/trackings/${id}`, {
            method: "DELETE",
          })
        )
      );
      
      // 从列表中移除已删除的运单
      setTrackings(trackings.filter(tracking => !selectedTrackings.includes(tracking.id)));
      toast.success(`成功删除 ${selectedTrackings.length} 个运单`);
      
      // 清空选择
      setSelectedTrackings([]);
    } catch (error) {
      console.error("Failed to batch delete trackings:", error);
      toast.error("批量删除运单失败");
    } finally {
      setBatchDeleteDialogOpen(false);
    }
  };
  
  // 批量归档运单
  const batchArchiveTrackings = async () => {
    if (selectedTrackings.length === 0) {
      toast.error("请选择至少一个运单");
      return;
    }
    
    try {
      // 使用Promise.all并行处理所有归档请求
      await Promise.all(
        selectedTrackings.map(id => 
          fetch(`/api/trackings/${id}/archive`, {
            method: "POST",
          })
        )
      );
      
      // 从列表中移除已归档的运单
      setTrackings(trackings.filter(tracking => !selectedTrackings.includes(tracking.id)));
      toast.success(`成功归档 ${selectedTrackings.length} 个运单`);
      
      // 清空选择
      setSelectedTrackings([]);
    } catch (error) {
      console.error("Failed to batch archive trackings:", error);
      toast.error("批量归档运单失败");
    }
  };
  
  // 复制选中的运单信息
  const copySelectedTrackings = async () => {
    if (selectedTrackings.length === 0) {
      toast.error("请选择至少一个运单");
      return;
    }
    
    // 按照界面显示顺序获取运单号
    const orderedTrackingIds = sortedTrackings
      .filter(tracking => selectedTrackings.includes(tracking.id))
      .map(tracking => tracking.id);
    
    // 获取选中运单的信息
    const selectedTrackingInfo = orderedTrackingIds
      .map(id => {
        const tracking = trackings.find(t => t.id === id);
        if (!tracking) return null;
        return tracking.trackingNumber;
      })
      .filter(Boolean)
      .join('\n');
    
    try {
      // 检查是否支持 clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(selectedTrackingInfo);
        toast.success(`已复制 ${selectedTrackings.length} 个运单信息到剪贴板`);
      } else {
        // 降级方案：使用传统的复制方法
        const textArea = document.createElement('textarea');
        textArea.value = selectedTrackingInfo;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          toast.success(`已复制 ${selectedTrackings.length} 个运单信息到剪贴板`);
        } catch (error) {
          console.error("Failed to copy trackings:", error);
          toast.error('复制失败，请手动复制');
        }
        
        textArea.remove();
      }
    } catch (error) {
      console.error("Failed to copy trackings:", error);
      toast.error("复制运单信息失败");
    }
  };
  
  // 复制单个运单信息
  const copySingleTracking = async (tracking: Tracking) => {
    const trackingInfo = tracking.trackingNumber;
    try {
      // 检查是否支持 clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(trackingInfo);
        toast.success("已复制运单信息到剪贴板");
      } else {
        // 降级方案：使用传统的复制方法
        const textArea = document.createElement('textarea');
        textArea.value = trackingInfo;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          toast.success("已复制运单信息到剪贴板");
        } catch (error) {
          console.error("Failed to copy tracking:", error);
          toast.error('复制失败，请手动复制');
        }
        
        textArea.remove();
      }
    } catch (error) {
      console.error("Failed to copy tracking:", error);
      toast.error("复制运单信息失败");
    }
  };
  
  // 取消所有选择
  const clearAllSelections = () => {
    setSelectedTrackings([]);
  };
  
  // 批量查询 17track
  const search17Track = () => {
    if (selectedTrackings.length === 0) {
      toast.error("请选择至少一个运单");
      return;
    }
    
    // 按照界面显示顺序获取运单号
    const orderedTrackingIds = sortedTrackings
      .filter(tracking => selectedTrackings.includes(tracking.id))
      .map(tracking => tracking.id);
    
    const trackingNumbers = orderedTrackingIds
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
  
  if (isLoading) {
    return <div className="text-center py-8">加载中...</div>;
  }
  
  if (trackings.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">暂无运单数据</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {selectedTrackings.length > 0 && (
        <div className="flex items-center justify-between bg-muted p-2 rounded-md">
          <div className="flex items-center space-x-2">
            <span>已选择 {selectedTrackings.length} 个运单</span>
            <Button onClick={clearAllSelections} size="sm" variant="ghost" className="text-muted-foreground">
              取消选择
            </Button>
          </div>
          <div className="flex space-x-2">
            <Button onClick={copySelectedTrackings} size="sm" variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              复制信息
            </Button>
            <Button onClick={() => setBatchDeleteDialogOpen(true)} size="sm" variant="outline" className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              全部删除
            </Button>
            <Button onClick={batchArchiveTrackings} size="sm" variant="outline">
              <Archive className="h-4 w-4 mr-2" />
              全部归档
            </Button>
            <Button onClick={search17Track} size="sm">
              <Search className="h-4 w-4 mr-2" />
              17Track 批量查询
            </Button>
          </div>
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
              <TableHead className="min-w-[200px] max-w-[300px]">备注</TableHead>
              <TableHead>物流公司</TableHead>
              <TableHead>货代商</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>
                <div
                  className="font-semibold cursor-pointer flex items-center"
                  onClick={() => toggleSort("createdAt")}
                >
                  添加日期{getSortIcon("createdAt")}
                </div>
              </TableHead>
              <TableHead className="w-[60px]">添加天数</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTrackings.map((tracking) => (
              <TableRow key={tracking.id} className="group">
                <TableCell>
                  <Checkbox 
                    checked={selectedTrackings.includes(tracking.id)}
                    onCheckedChange={() => toggleSelect(tracking.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <button 
                    onClick={() => copySingleTracking(tracking)} 
                    className="hover:text-primary cursor-pointer flex items-center"
                    title="点击复制运单号"
                  >
                    {tracking.trackingNumber}
                  </button>
                </TableCell>
                <TableCell className="whitespace-pre-wrap break-words">
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
                      <span className="flex-1">{tracking.note || "-"}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditingNote(tracking.id, tracking.note)}
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={tracking.logisticsCompany?.id || "none"}
                    onValueChange={(value) => updateLogisticsCompany(tracking.id, value)}
                  >
                    <SelectTrigger className="w-[120px]">
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
                    <SelectTrigger className="w-[120px]">
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
                    <SelectTrigger className={`w-[100px] ${getStatusColor(tracking.status)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TrackingStatus.PENDING}>待处理</SelectItem>
                      <SelectItem value={TrackingStatus.TRANSIT}>运输中</SelectItem>
                      <SelectItem value={TrackingStatus.DELIVERED}>已签收</SelectItem>
                      <SelectItem value={TrackingStatus.EXCEPTION}>异常</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {new Date(tracking.createdAt).toLocaleDateString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-xs">
                    {Math.floor((new Date().getTime() - new Date(tracking.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天
                  </span>
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
                    
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => archiveTracking(tracking.id)}
                      title="归档"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        setTrackingToDelete(tracking.id);
                        setDeleteDialogOpen(true);
                      }}
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除选中的 {selectedTrackings.length} 个运单吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={batchDeleteTrackings}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 