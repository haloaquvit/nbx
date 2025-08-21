"use client"
import { useState } from "react"
import { Outlet } from "react-router-dom"
import { Header } from "./Header"
import { Sidebar } from "./Sidebar"
import { cn } from "@/lib/utils"

export function Layout() {
  const [isCollapsed, setIsCollapsed] = useState(true) // Default minimize

  return (
    <div className="grid min-h-screen w-full grid-cols-[auto_1fr]">
      <div className={cn(
        "hidden border-r bg-muted/40 md:block transition-all duration-300",
        isCollapsed ? "w-[60px]" : "w-[220px] lg:w-[280px]"
      )}>
        <Sidebar isCollapsed={isCollapsed} setCollapsed={setIsCollapsed} />
      </div>
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 overflow-auto min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}