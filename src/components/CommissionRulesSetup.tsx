import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'

export function CommissionRulesSetup() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string>('')
  const [error, setError] = useState<string>('')

  const setupCommissionRules = async () => {
    setIsLoading(true)
    setError('')
    setResult('')

    try {
      console.log('🔧 Setting up commission rules for driver and helper roles...')

      // First get all products
      const { data: products, error: productError } = await supabase
        .from('products')
        .select('id, name, type')
        .eq('type', 'Stock')

      if (productError) {
        throw new Error(`Failed to fetch products: ${productError.message}`)
      }

      console.log(`Found ${products?.length || 0} stock products`)

      if (!products || products.length === 0) {
        setResult('No stock products found in the database')
        return
      }

      // Create commission rules for each product
      const driverRules = []
      const helperRules = []

      for (const product of products) {
        driverRules.push({
          product_id: product.id,
          product_name: product.name,
          role: 'driver',
          rate_per_qty: 1000 // 1000 rupiah per item for driver
        })

        helperRules.push({
          product_id: product.id,
          product_name: product.name,
          role: 'helper',
          rate_per_qty: 500 // 500 rupiah per item for helper
        })
      }

      let resultText = `Processing ${products.length} products...\n\n`

      // Insert driver rules
      if (driverRules.length > 0) {
        const { data: driverData, error: driverError } = await supabase
          .from('commission_rules')
          .upsert(driverRules, { onConflict: 'product_id,role' })
          .select()

        if (driverError) {
          resultText += `❌ Driver rules error: ${driverError.message}\n`
        } else {
          resultText += `✅ Created/updated ${driverData?.length || 0} driver commission rules\n`
        }
      }

      // Insert helper rules
      if (helperRules.length > 0) {
        const { data: helperData, error: helperError } = await supabase
          .from('commission_rules')
          .upsert(helperRules, { onConflict: 'product_id,role' })
          .select()

        if (helperError) {
          resultText += `❌ Helper rules error: ${helperError.message}\n`
        } else {
          resultText += `✅ Created/updated ${helperData?.length || 0} helper commission rules\n`
        }
      }

      // Verify the rules were created
      const { data: verifyRules, error: verifyError } = await supabase
        .from('commission_rules')
        .select('role, count(*)')
        .in('role', ['driver', 'helper'])

      if (!verifyError && verifyRules) {
        resultText += `\n📊 Commission rules summary:\n`
        verifyRules.forEach((rule: any) => {
          resultText += `  - ${rule.role}: ${rule.count} rules\n`
        })
      }

      setResult(resultText)
      console.log('✅ Commission rules setup completed')

    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error occurred'
      console.error('❌ Error setting up commission rules:', err)
      setError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const checkExistingRules = async () => {
    setIsLoading(true)
    setError('')
    setResult('')

    try {
      console.log('🔍 Checking existing commission rules...')

      // Check all commission rules
      const { data: allRules, error: allError } = await supabase
        .from('commission_rules')
        .select('*')
        .order('role')

      if (allError) {
        throw new Error(`Failed to fetch commission rules: ${allError.message}`)
      }

      // Check driver/helper rules specifically
      const { data: deliveryRules, error: deliveryError } = await supabase
        .from('commission_rules')
        .select('*')
        .in('role', ['driver', 'helper'])
        .order('role')

      if (deliveryError) {
        throw new Error(`Failed to fetch delivery commission rules: ${deliveryError.message}`)
      }

      let resultText = `📋 Commission Rules Report:\n\n`
      resultText += `Total commission rules: ${allRules?.length || 0}\n`
      resultText += `Driver/Helper rules: ${deliveryRules?.length || 0}\n\n`

      if (allRules && allRules.length > 0) {
        const roleGroups = allRules.reduce((acc: any, rule: any) => {
          if (!acc[rule.role]) acc[rule.role] = 0
          acc[rule.role]++
          return acc
        }, {})

        resultText += `Rules by role:\n`
        Object.entries(roleGroups).forEach(([role, count]) => {
          resultText += `  - ${role}: ${count} rules\n`
        })
        resultText += `\n`
      }

      if (deliveryRules && deliveryRules.length > 0) {
        resultText += `Driver/Helper commission rules (showing first 5):\n`
        deliveryRules.slice(0, 5).forEach((rule: any) => {
          resultText += `  - ${rule.role}: ${rule.product_name} = ${rule.rate_per_qty} per qty\n`
        })
      } else {
        resultText += `⚠️  No driver/helper commission rules found!\n`
        resultText += `This means delivery commissions will not be generated.\n`
      }

      setResult(resultText)

    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error occurred'
      console.error('❌ Error checking commission rules:', err)
      setError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Commission Rules Setup</CardTitle>
        <CardDescription>
          Setup and manage commission rules for delivery personnel (driver and helper roles)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Button 
            onClick={checkExistingRules}
            disabled={isLoading}
            variant="outline"
          >
            {isLoading ? 'Checking...' : 'Check Existing Rules'}
          </Button>
          
          <Button 
            onClick={setupCommissionRules}
            disabled={isLoading}
          >
            {isLoading ? 'Setting up...' : 'Setup Driver/Helper Rules'}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Card>
            <CardContent className="pt-6">
              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded">
                {result}
              </pre>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}

export default CommissionRulesSetup