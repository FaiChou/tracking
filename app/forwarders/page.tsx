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
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";

type Forwarder = {
  id: string;
  name: string;
  color: string;
  address?: string;
};

// 常用颜色选择
const commonColors = [
  { name: "红色", value: "#ef4444" },
  { name: "蓝色", value: "#3b82f6" },
  { name: "绿色", value: "#22c55e" },
  { name: "黄色", value: "#eab308" },
  { name: "紫色", value: "#a855f7" },
  { name: "粉色", value: "#ec4899" },
  { name: "橙色", value: "#f97316" },
  { name: "青色", value: "#06b6d4" },
  { name: "灰色", value: "#6b7280" },
  { name: "黑色", value: "#000000" },
];

export default function ForwardersPage() {
  const [forwarders, setForwarders] = useState<Forwarder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [forwarderToDelete, setForwarderToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 表单状态
  const [editingForwarder, setEditingForwarder] = useState<Forwarder | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#000000");
  const [address, setAddress] = useState("");
  
  // 获取货代商列表
  const fetchForwarders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/forwarders");
      const data = await res.json();
      setForwarders(data);
    } catch (error) {
      console.error("Failed to fetch forwarders:", error);
      toast.error("获取货代商列表失败");
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchForwarders();
  }, []);
  
  // 打开编辑对话框
  const openEditDialog = (forwarder: Forwarder | null) => {
    setEditingForwarder(forwarder);
    if (forwarder) {
      setName(forwarder.name);
      setColor(forwarder.color);
      setAddress(forwarder.address || "");
    } else {
      setName("");
      setColor("#000000");
      setAddress("");
    }
    setIsDialogOpen(true);
  };
  
  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("请输入货代商名称");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      let res;
      
      if (editingForwarder) {
        // 更新
        res = await fetch(`/api/forwarders/${editingForwarder.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, color, address }),
        });
      } else {
        // 创建
        res = await fetch("/api/forwarders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, color, address }),
        });
      }
      
      if (res.ok) {
        toast.success(editingForwarder ? "货代商已更新" : "货代商已创建");
        setIsDialogOpen(false);
        fetchForwarders();
      } else {
        const error = await res.json();
        toast.error(error.message || "操作失败");
      }
    } catch (error) {
      console.error("Failed to save forwarder:", error);
      toast.error("操作失败");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 删除货代商
  const deleteForwarder = async () => {
    if (!forwarderToDelete) return;
    
    try {
      const res = await fetch(`/api/forwarders/${forwarderToDelete}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        setForwarders(forwarders.filter(f => f.id !== forwarderToDelete));
        toast.success("货代商已删除");
      } else {
        const error = await res.json();
        toast.error(error.message || "删除失败");
      }
    } catch (error) {
      console.error("Failed to delete forwarder:", error);
      toast.error("删除失败");
    } finally {
      setIsDeleteDialogOpen(false);
      setForwarderToDelete(null);
    }
  };
  
  // 复制地址到剪贴板
  const copyAddressToClipboard = (address: string) => {
    copyToClipboard(address, "地址已复制到剪贴板");
  };
  
  if (isLoading) {
    return <div className="text-center py-8">加载中...</div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">货代商管理</h1>
        <Button onClick={() => openEditDialog(null)}>
          <Plus className="h-4 w-4 mr-2" />
          添加货代商
        </Button>
      </div>
      
      {forwarders.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">暂无货代商数据</p>
          <Button onClick={() => openEditDialog(null)}>
            添加货代商
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>颜色</TableHead>
                <TableHead>货代地址</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwarders.map((forwarder) => (
                <TableRow key={forwarder.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-2" 
                        style={{ backgroundColor: forwarder.color }}
                      />
                      {forwarder.name}
                    </div>
                  </TableCell>
                  <TableCell>{forwarder.color}</TableCell>
                  <TableCell>
                    {forwarder.address ? (
                      <button 
                        className="text-left hover:text-primary cursor-pointer whitespace-pre-line"
                        onClick={() => copyAddressToClipboard(forwarder.address || "")}
                        title="点击复制地址"
                      >
                        {forwarder.address}
                      </button>
                    ) : (
                      <span className="text-muted-foreground italic">未设置</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDialog(forwarder)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          setForwarderToDelete(forwarder.id);
                          setIsDeleteDialogOpen(true);
                        }}
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
      )}
      
      {/* 编辑/创建对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingForwarder ? "编辑货代商" : "添加货代商"}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入货代商名称"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="color">颜色</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-10 p-1"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {commonColors.map((colorOption) => (
                  <Button
                    key={colorOption.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="p-1 w-8 h-8"
                    style={{ backgroundColor: colorOption.value }}
                    title={colorOption.name}
                    onClick={() => setColor(colorOption.value)}
                  />
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">地址</Label>
              <textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="输入货代商地址"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                rows={5}
              />
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* 删除确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除这个货代商吗？此操作无法撤销，并且可能会影响关联的运单。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteForwarder}
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