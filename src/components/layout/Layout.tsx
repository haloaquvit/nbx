"use client"
import { useState } from "react"
import { Outlet } from "react-router-dom"
import { Header } from "./Header"
import { Sidebar } from "./Sidebar"
import { cn } from "@/lib/utils"

export function Layout() {
  const [isCollapsed, setIsCollapsed] = useState(true) // Default minimize

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className={cn(
        "hidden border-r bg-muted/40 md:block",
        isCollapsed && "md:w-[60px] lg:w-[60px]"
      )}>
        <Sidebar isCollapsed={isCollapsed} setCollapsed={setIsCollapsed} />
      </div>
      <div className="flex flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}