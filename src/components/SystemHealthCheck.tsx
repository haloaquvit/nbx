"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { isAuditSystemAvailable } from "@/utils/safeAuditLog"

interface HealthCheck {
  name: string
  status: 'healthy' | 'warning' | 'error'
  message: string
  timestamp: Date
}

export function SystemHealthCheck() {
  const [checks, setChecks] = useState<HealthCheck[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const runHealthCheck = async () => {
    setIsRunning(true)
    const newChecks: HealthCheck[] = []

    // Check 1: Database Connection
    try {
      await supabase.from('profiles').select('id').limit(1)
      newChecks.push({
        name: 'Database Connection',
        status: 'healthy',
        message: 'Connected to Supabase successfully',
        timestamp: new Date()
      })
    } catch (error) {
      newChecks.push({
        name: 'Database Connection',
        status: 'error',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      })
    }

    // Check 2: User Authentication
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        newChecks.push({
          name: 'Authentication',
          status: 'healthy',
          message: `Authenticated as: ${user.email}`,
          timestamp: new Date()
        })
      } else {
        newChecks.push({
          name: 'Authentication',
          status: 'warning',
          message: 'No authenticated user',
          timestamp: new Date()
        })
      }
    } catch (error) {
      newChecks.push({
        name: 'Authentication',
        status: 'error',
        message: `Auth check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      })
    }

    // Check 3: Audit System
    try {
      const auditAvailable = await isAuditSystemAvailable()
      if (auditAvailable) {
        newChecks.push({
          name: 'Audit System',
          status: 'healthy',
          message: 'Audit logging system is available',
          timestamp: new Date()
        })
      } else {
        newChecks.push({
          name: 'Audit System',
          status: 'warning',
          message: 'Audit system not deployed, using fallback',
          timestamp: new Date()
        })
      }
    } catch (error) {
      newChecks.push({
        name: 'Audit System',
        status: 'warning',
        message: 'Audit system check failed, using fallback',
        timestamp: new Date()
      })
    }

    // Check 4: Optimized Functions
    try {
      await supabase.rpc('search_products_with_stock', {
        search_term: '',
        limit_count: 1
      })
      newChecks.push({
        name: 'Optimized Functions',
        status: 'healthy',
        message: 'RPC functions are available',
        timestamp: new Date()
      })
    } catch (error) {
      newChecks.push({
        name: 'Optimized Functions',
        status: 'warning',
        message: 'RPC functions not deployed, using fallback queries',
        timestamp: new Date()
      })
    }

    // Check 5: Views and Materialized Views
    try {
      await supabase.from('dashboard_summary').select('*').limit(1)
      newChecks.push({
        name: 'Dashboard Views',
        status: 'healthy',
        message: 'Dashboard views are available',
        timestamp: new Date()
      })
    } catch (error) {
      newChecks.push({
        name: 'Dashboard Views',
        status: 'warning',
        message: 'Dashboard views not deployed, using fallback calculation',
        timestamp: new Date()
      })
    }

    // Check 6: Table Access
    const tables = ['transactions', 'products', 'customers', 'materials']
    for (const table of tables) {
      try {
        await supabase.from(table).select('id').limit(1)
        newChecks.push({
          name: `Table: ${table}`,
          status: 'healthy',
          message: `${table} table accessible`,
          timestamp: new Date()
        })
      } catch (error) {
        newChecks.push({
          name: `Table: ${table}`,
          status: 'error',
          message: `${table} table access failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date()
        })
      }
    }

    setChecks(newChecks)
    setIsRunning(false)
  }

  useEffect(() => {
    runHealthCheck()
  }, [])

  const getStatusIcon = (status: HealthCheck['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusBadge = (status: HealthCheck['status']) => {
    const variants = {
      healthy: 'success',
      warning: 'default',
      error: 'destructive'
    } as const

    return (
      <Badge variant={variants[status]}>
        {status.toUpperCase()}
      </Badge>
    )
  }

  const overallHealth = checks.length > 0 ? {
    healthy: checks.filter(c => c.status === 'healthy').length,
    warning: checks.filter(c => c.status === 'warning').length,
    error: checks.filter(c => c.status === 'error').length
  } : null

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              System Health Check
              {overallHealth && (
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-green-600">✓{overallHealth.healthy}</span>
                  <span className="text-yellow-600">⚠{overallHealth.warning}</span>
                  <span className="text-red-600">✗{overallHealth.error}</span>
                </div>
              )}
            </CardTitle>
            <CardDescription>
              Check system components and database migrations status
            </CardDescription>
          </div>
          <Button
            onClick={runHealthCheck}
            disabled={isRunning}
            variant="outline"
            size="sm"
          >
            {isRunning ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isRunning ? 'Checking...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {checks.map((check, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(check.status)}
                <div>
                  <div className="font-medium">{check.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {check.message}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(check.status)}
                <div className="text-xs text-muted-foreground">
                  {check.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          
          {checks.length === 0 && !isRunning && (
            <div className="text-center py-8 text-muted-foreground">
              Click "Refresh" to run health check
            </div>
          )}
          
          {isRunning && (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <div className="text-muted-foreground">Running health checks...</div>
            </div>
          )}
        </div>

        {overallHealth && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">System Status Summary</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {overallHealth.healthy}
                </div>
                <div className="text-sm text-muted-foreground">Healthy</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {overallHealth.warning}
                </div>
                <div className="text-sm text-muted-foreground">Warnings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {overallHealth.error}
                </div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>
            
            {overallHealth.error === 0 && overallHealth.warning <= 3 && (
              <div className="mt-3 text-center">
                <Badge variant="success">System is operational with fallbacks</Badge>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}