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
  const [forwarders, setForwarders] = useState<{ id: string; name: string; color: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    // 获取货代商列表
    fetch("/api/forwarders")
      .then(res => res.json())
      .then(data => setForwarders(data))
      .catch(err => console.error("Failed to fetch forwarders:", err));
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!trackingNumbers.trim()) {
      toast.error("请输入至少一个运单号");
      return;
    }
    
    // 分割运单号，每行一个
    const numbers = trackingNumbers
      .split("\n")
      .map(n => n.trim())
      .filter(Boolean);
    
    if (numbers.length === 0) {
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
          trackingNumbers: numbers,
          forwarderId: forwarderId === "none" ? undefined : forwarderId,
        }),
      });
      
      if (res.ok) {
        toast.success(`成功添加 ${numbers.length} 个运单号`);
        setTrackingNumbers("");
        setForwarderId("none");
        setIsOpen(false);
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
                placeholder="请输入运单号，每行一个"
                rows={10}
                value={trackingNumbers}
                onChange={(e) => setTrackingNumbers(e.target.value)}
                className="font-mono"
              />
              <p className="text-sm text-muted-foreground">
                已输入 {trackingNumbers.split("\n").filter(n => n.trim()).length} 个运单号
              </p>
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