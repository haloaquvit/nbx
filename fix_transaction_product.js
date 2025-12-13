import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://emfvoassfrsokqwspuml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM'
)

async function fixTransactionProduct() {
  const invalidProductId = '649057d6-8e2f-408a-b079-417dd660cbc1'

  console.log('🔍 Step 1: Finding transactions with invalid product ID...')

  // Find transaction items with invalid product ID
  const { data: transactionItems, error: itemsError } = await supabase
    .from('transaction_items')
    .select('*, transactions(transaction_number, customer_name)')
    .eq('product_id', invalidProductId)

  if (itemsError) {
    console.error('❌ Error finding transaction items:', itemsError)
    return
  }

  console.log(`📦 Found ${transactionItems?.length || 0} transaction items with invalid product ID`)

  if (transactionItems && transactionItems.length > 0) {
    transactionItems.forEach(item => {
      console.log(`  - Transaction: ${item.transactions?.transaction_number}, Customer: ${item.transactions?.customer_name}`)
      console.log(`    Product: ${item.product_name}, Qty: ${item.quantity}`)
    })
  }

  console.log('\n🎯 Step 2: Getting valid product IDs...')

  // Get all available products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, unit')
    .order('name')

  if (productsError) {
    console.error('❌ Error getting products:', productsError)
    return
  }

  console.log('✅ Available products:')
  products?.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.unit}) - ID: ${p.id}`)
  })

  if (!transactionItems || transactionItems.length === 0) {
    console.log('\n✅ No transaction items need to be fixed!')
    return
  }

  console.log('\n🔧 Step 3: Updating transaction items...')
  console.log('Will update to first product:', products?.[0]?.name)

  // Update all invalid items to use the first valid product
  const validProductId = products?.[0]?.id

  if (!validProductId) {
    console.error('❌ No valid products available!')
    return
  }

  for (const item of transactionItems) {
    const { error: updateError } = await supabase
      .from('transaction_items')
      .update({
        product_id: validProductId,
        product_name: products[0].name,
        unit: products[0].unit
      })
      .eq('id', item.id)

    if (updateError) {
      console.error(`❌ Error updating item ${item.id}:`, updateError)
    } else {
      console.log(`✅ Updated item in transaction ${item.transactions?.transaction_number}`)
    }
  }

  console.log('\n✨ Done! Transaction items have been updated.')
}

fixTransactionProduct()
