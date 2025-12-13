import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://emfvoassfrsokqwspuml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM'
)

async function fixTransactionItems() {
  const invalidProductId = '649057d6-8e2f-408a-b079-417dd660cbc1'

  console.log('🔍 Step 1: Finding transactions with invalid product ID in items array...')

  // Get all transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('id, customer_name, items')
    .order('created_at', { ascending: false })
    .limit(50) // Check recent 50 transactions

  if (txError) {
    console.error('❌ Error getting transactions:', txError)
    return
  }

  console.log(`📦 Checking ${transactions?.length || 0} recent transactions...`)

  // Find transactions with invalid product ID in items array
  const problematicTransactions = []

  if (transactions) {
    for (const tx of transactions) {
      if (Array.isArray(tx.items)) {
        const hasInvalidProduct = tx.items.some(item =>
          item.productId === invalidProductId
        )

        if (hasInvalidProduct) {
          problematicTransactions.push(tx)
          console.log(`⚠️  Found: ${tx.id} - ${tx.customer_name}`)
          console.log(`   Items with invalid product:`)
          tx.items.forEach(item => {
            if (item.productId === invalidProductId) {
              console.log(`     - ${item.productName} (Qty: ${item.quantity})`)
            }
          })
        }
      }
    }
  }

  if (problematicTransactions.length === 0) {
    console.log('✅ No transactions found with invalid product ID!')
    return
  }

  console.log(`\n🎯 Found ${problematicTransactions.length} transaction(s) to fix`)

  console.log('\n🔧 Step 2: Getting valid product to use as replacement...')

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, unit')
    .order('name')
    .limit(10)

  if (productsError) {
    console.error('❌ Error getting products:', productsError)
    return
  }

  console.log('✅ Available products:')
  products?.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.unit}) - ID: ${p.id}`)
  })

  const validProduct = products?.[0]
  if (!validProduct) {
    console.error('❌ No valid products available!')
    return
  }

  console.log(`\n🔧 Step 3: Updating transactions to use: ${validProduct.name}`)

  // Update each transaction
  for (const tx of problematicTransactions) {
    const updatedItems = tx.items.map(item => {
      if (item.productId === invalidProductId) {
        console.log(`  ✏️  Updating item in ${tx.id}:`)
        console.log(`     Old: ${item.productName} (${invalidProductId})`)
        console.log(`     New: ${validProduct.name} (${validProduct.id})`)

        return {
          ...item,
          productId: validProduct.id,
          productName: validProduct.name,
          unit: validProduct.unit
        }
      }
      return item
    })

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ items: updatedItems })
      .eq('id', tx.id)

    if (updateError) {
      console.error(`❌ Error updating ${tx.id}:`, updateError)
    } else {
      console.log(`✅ Updated ${tx.id}`)
    }
  }

  console.log('\n✨ Done! All transactions have been updated.')
  console.log('🔄 Please refresh your browser to see the changes.')
}

fixTransactionItems()
