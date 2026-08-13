import { redirect } from "next/navigation";

// 根路径直接跳到比对工具（首个工具即默认工具）
export default function HomePage() {
  redirect("/compare");
}
