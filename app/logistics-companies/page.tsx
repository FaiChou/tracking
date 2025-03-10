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
  DialogFooter,
  DialogTrigger
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

type LogisticsCompany = {
  id: string;
  name: string;
  color: string;
  trackingUrl: string;
};

// 常用物流公司示例
const logisticsCompanyExamples = [
  { name: "FedEx", trackingUrl: "https://www.fedex.com/fedextrack/?trknbr=" },
  { name: "UPS", trackingUrl: "https://www.ups.com/track?tracknum=" },
  { name: "USPS", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=" },
  { name: "DHL", trackingUrl: "https://www.dhl.com/en/express/tracking.html?AWB=" },
  { name: "CJ Logistics", trackingUrl: "https://www.cjlogistics.com/en/tool/parcel/tracking?gnbInvcNo=" },
];

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

export default function LogisticsCompaniesPage() {
  const [companies, setCompanies] = useState<LogisticsCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 表单状态
  const [editingCompany, setEditingCompany] = useState<LogisticsCompany | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#000000");
  const [trackingUrl, setTrackingUrl] = useState("");
  
  // 获取物流公司列表
  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/logistics-companies");
      const data = await res.json();
      setCompanies(data);
    } catch (error) {
      console.error("Failed to fetch logistics companies:", error);
      toast.error("获取物流公司列表失败");
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchCompanies();
  }, []);
  
  // 打开编辑对话框
  const openEditDialog = (company: LogisticsCompany | null) => {
    setEditingCompany(company);
    if (company) {
      setName(company.name);
      setColor(company.color);
      setTrackingUrl(company.trackingUrl);
    } else {
      setName("");
      setColor("#000000");
      setTrackingUrl("");
    }
    setIsDialogOpen(true);
  };
  
  // 使用示例
  const useExample = (example: { name: string; trackingUrl: string }) => {
    setName(example.name);
    setTrackingUrl(example.trackingUrl);
  };
  
  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("请输入物流公司名称");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      let res;
      
      if (editingCompany) {
        // 更新
        res = await fetch(`/api/logistics-companies/${editingCompany.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, color, trackingUrl }),
        });
      } else {
        // 创建
        res = await fetch("/api/logistics-companies", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, color, trackingUrl }),
        });
      }
      
      if (res.ok) {
        toast.success(editingCompany ? "物流公司已更新" : "物流公司已创建");
        setIsDialogOpen(false);
        fetchCompanies();
      } else {
        const error = await res.json();
        toast.error(error.message || "操作失败");
      }
    } catch (error) {
      console.error("Failed to save logistics company:", error);
      toast.error("操作失败");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 删除物流公司
  const deleteCompany = async () => {
    if (!companyToDelete) return;
    
    try {
      const res = await fetch(`/api/logistics-companies/${companyToDelete}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        setCompanies(companies.filter(c => c.id !== companyToDelete));
        toast.success("物流公司已删除");
      } else {
        const error = await res.json();
        toast.error(error.message || "删除失败");
      }
    } catch (error) {
      console.error("Failed to delete logistics company:", error);
      toast.error("删除失败");
    } finally {
      setIsDeleteDialogOpen(false);
      setCompanyToDelete(null);
    }
  };
  
  if (isLoading) {
    return <div className="text-center py-8">加载中...</div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">物流公司管理</h1>
        <Button onClick={() => openEditDialog(null)}>
          <Plus className="h-4 w-4 mr-2" />
          添加物流公司
        </Button>
      </div>
      
      {companies.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">暂无物流公司数据</p>
          <Button onClick={() => openEditDialog(null)}>
            添加物流公司
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>颜色</TableHead>
                <TableHead>查询网址</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-2" 
                        style={{ backgroundColor: company.color }}
                      />
                      {company.name}
                    </div>
                  </TableCell>
                  <TableCell>{company.color}</TableCell>
                  <TableCell className="font-mono text-sm">{company.trackingUrl}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDialog(company)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          setCompanyToDelete(company.id);
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCompany ? "编辑物流公司" : "添加物流公司"}
            </DialogTitle>
          </DialogHeader>
          
          {!editingCompany && (
            <div className="mb-4">
              <Label className="mb-2 block">快速选择常用物流公司</Label>
              <div className="flex flex-wrap gap-2">
                {logisticsCompanyExamples.map((example) => (
                  <Button 
                    key={example.name} 
                    variant="outline" 
                    size="sm"
                    onClick={() => useExample(example)}
                  >
                    {example.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：UPS, FedEx, DHL"
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
              <Label htmlFor="trackingUrl">查询网址 (可选)</Label>
              <Input
                id="trackingUrl"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="例如：https://www.ups.com/track?tracknum="
              />
              <p className="text-sm text-muted-foreground">
                输入查询网址，运单号将自动拼接在网址后面
              </p>
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
              您确定要删除这个物流公司吗？此操作无法撤销，并且可能会影响关联的运单。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteCompany}
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