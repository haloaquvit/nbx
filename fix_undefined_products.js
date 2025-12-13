import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://emfvoassfrsokqwspuml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM'
)

async function fixUndefinedProducts() {
  const transactionId = 'KRP-250905-832'

  console.log('🔍 Step 1: Getting transaction...')

  const { data: transaction, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .single()

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log('✅ Transaction found:', transaction.customer_name)

  console.log('\n🎯 Step 2: Getting valid products...')

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, unit')
    .order('name')
    .limit(5)

  if (productsError) {
    console.error('❌ Error:', productsError)
    return
  }

  console.log('✅ Available products:')
  products?.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.unit}) - ID: ${p.id}`)
  })

  // Use first product as default
  const defaultProduct = products?.[0]

  if (!defaultProduct) {
    console.error('❌ No products available!')
    return
  }

  console.log('\n🔧 Step 3: Updating transaction items...')

  const updatedItems = transaction.items.map((item, index) => {
    if (!item.productId) {
      console.log(`  ✏️  Fixing item ${index + 1}:`)
      console.log(`     Name: ${item.productName || 'Unknown'}`)
      console.log(`     Adding product ID: ${defaultProduct.id}`)

      return {
        ...item,
        productId: defaultProduct.id,
        productName: item.productName || defaultProduct.name,
        unit: item.unit || defaultProduct.unit
      }
    }
    return item
  })

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ items: updatedItems })
    .eq('id', transactionId)

  if (updateError) {
    console.error('❌ Error updating:', updateError)
  } else {
    console.log('\n✅ Transaction updated successfully!')
    console.log('🔄 Please refresh your browser to test delivery creation again.')
  }
}

fixUndefinedProducts()
