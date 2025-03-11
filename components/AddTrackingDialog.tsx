"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type AddTrackingDialogProps = {
  onSuccess?: () => void;
};

export default function AddTrackingDialog({ onSuccess }: AddTrackingDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [trackingNumbers, setTrackingNumbers] = useState("");
  const [forwarderId, setForwarderId] = useState("none");
  const [logisticsCompanyId, setLogisticsCompanyId] = useState("none");
  const [forwarders, setForwarders] = useState<{ id: string; name: string; color: string }[]>([]);
  const [logisticsCompanies, setLogisticsCompanies] = useState<{ id: string; name: string; color: string; trackingUrl: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 添加快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检测 Ctrl+J 或 Command+J
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault(); // 阻止默认行为
        setIsOpen(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  
  useEffect(() => {
    // 获取货代商列表
    fetch("/api/forwarders")
      .then(res => res.json())
      .then(data => setForwarders(data))
      .catch(err => console.error("Failed to fetch forwarders:", err));
    
    // 获取物流公司列表
    fetch("/api/logistics-companies")
      .then(res => res.json())
      .then(data => setLogisticsCompanies(data))
      .catch(err => console.error("Failed to fetch logistics companies:", err));
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!trackingNumbers.trim()) {
      toast.error("请输入至少一个运单号");
      return;
    }
    
    // 分割运单号，每行一个，并解析备注
    const trackingsWithNotes = trackingNumbers
      .split("\n")
      .map(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;
        
        // 查找第一个空格的位置
        const firstSpaceIndex = trimmedLine.indexOf(' ');
        
        // 如果没有空格，则整行都是运单号
        if (firstSpaceIndex === -1) {
          return { trackingNumber: trimmedLine, note: null };
        }
        
        // 分割运单号和备注
        const trackingNumber = trimmedLine.substring(0, firstSpaceIndex).trim();
        const note = trimmedLine.substring(firstSpaceIndex + 1).trim() || null;
        
        return { trackingNumber, note };
      })
      .filter(Boolean);
    
    if (trackingsWithNotes.length === 0) {
      toast.error("请输入至少一个有效的运单号");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const res = await fetch("/api/trackings/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingsWithNotes,
          forwarderId: forwarderId === "none" ? undefined : forwarderId,
          logisticsCompanyId: logisticsCompanyId === "none" ? undefined : logisticsCompanyId,
        }),
      });
      
      if (res.ok) {
        toast.success(`成功添加 ${trackingsWithNotes.length} 个运单号`);
        setTrackingNumbers("");
        setForwarderId("none");
        setLogisticsCompanyId("none");
        setIsOpen(false);
        
        // 触发自定义事件，通知列表刷新
        window.dispatchEvent(new CustomEvent("tracking:added"));
        
        if (onSuccess) onSuccess();
      } else {
        const error = await res.json();
        toast.error(error.message || "添加运单失败");
      }
    } catch (error) {
      console.error("Failed to add trackings:", error);
      toast.error("添加运单失败");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        添加运单
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加运单</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">运单号</label>
              <Textarea
                placeholder="请输入运单号，每行一个。格式：运单号 备注（备注可选）"
                rows={10}
                value={trackingNumbers}
                onChange={(e) => setTrackingNumbers(e.target.value)}
                className="font-mono"
                autoFocus
              />
              <p className="text-sm text-muted-foreground">
                已输入 {trackingNumbers.split("\n").filter(n => n.trim()).length} 个运单号
              </p>
              <p className="text-sm text-muted-foreground">
                提示：每行一个运单，如需添加备注，请在运单号后加空格，然后输入备注
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">物流公司</label>
                <Select value={logisticsCompanyId} onValueChange={setLogisticsCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择物流公司（可选）" />
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
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">货代商</label>
                <Select value={forwarderId} onValueChange={setForwarderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择货代商（可选）" />
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
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "添加中..." : "完成添加"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
} 