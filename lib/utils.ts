import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 复制文本到剪贴板
 * @param text 要复制的文本
 * @param successMessage 复制成功时的提示信息，默认为"已复制到剪贴板"
 * @returns Promise<boolean> 是否复制成功
 */
export async function copyToClipboard(text: string, successMessage: string = "已复制到剪贴板"): Promise<boolean> {
  try {
    // 检查是否支持 clipboard API 且在安全上下文中（https 或 localhost）
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      if (successMessage) {
        toast.success(successMessage);
      }
      return true;
    } else {
      // 降级方案：使用传统的复制方法
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // 设置样式使其不可见
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (success) {
        if (successMessage) {
          toast.success(successMessage);
        }
        return true;
      } else {
        toast.error("复制失败，请手动复制");
        return false;
      }
    }
  } catch (error) {
    console.error("复制失败:", error);
    toast.error("复制失败，请手动复制");
    return false;
  }
}
