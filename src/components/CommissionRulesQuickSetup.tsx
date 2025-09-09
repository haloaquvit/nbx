import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { AlertCircle, CheckCircle } from 'lucide-react'

export function CommissionRulesQuickSetup() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const setupRules = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      // Get all stock products
      const { data: products, error: productError } = await supabase
        .from('products')
        .select('id, name, type')
        .eq('type', 'Stock')

      if (productError) throw productError

      if (!products || products.length === 0) {
        setResult({ success: false, message: 'Tidak ada produk Stock ditemukan' })
        return
      }

      // Create rules for all roles
      const rules = []
      
      for (const product of products) {
        // Sales commission: 1000 per item
        rules.push({
          product_id: product.id,
          product_name: product.name,
          role: 'sales',
          rate_per_qty: 1000
        })
        
        // Driver commission: 500 per item
        rules.push({
          product_id: product.id,
          product_name: product.name,
          role: 'driver',
          rate_per_qty: 500
        })
        
        // Helper commission: 300 per item
        rules.push({
          product_id: product.id,
          product_name: product.name,
          role: 'helper',
          rate_per_qty: 300
        })
      }

      // Upsert rules
      const { error: upsertError } = await supabase
        .from('commission_rules')
        .upsert(rules, { onConflict: 'product_id,role' })

      if (upsertError) throw upsertError

      setResult({ 
        success: true, 
        message: `Setup selesai! ${products.length} produk × 3 role = ${rules.length} commission rules dibuat/diperbarui` 
      })

    } catch (error: any) {
      setResult({ 
        success: false, 
        message: `Error: ${error.message}` 
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Quick Setup Commission Rules</h3>
          <p className="text-sm text-muted-foreground">
            Buat aturan komisi untuk semua produk Stock dengan rate default
          </p>
        </div>
        <Button 
          onClick={setupRules} 
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700"
        >
          {isLoading ? 'Setting up...' : 'Setup Rules'}
        </Button>
      </div>

      {result && (
        <Alert variant={result.success ? "default" : "destructive"}>
          {result.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}

      {result?.success && (
        <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
          <p><strong>Rate yang diset:</strong></p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Sales: 1.000 per item</li>
            <li>Driver: 500 per item</li>
            <li>Helper: 300 per item</li>
          </ul>
          <p className="mt-2">Anda dapat mengubah rate ini di tabel di bawah.</p>
        </div>
      )}
    </div>
  )
}

export default CommissionRulesQuickSetup