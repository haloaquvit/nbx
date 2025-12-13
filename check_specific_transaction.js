import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://emfvoassfrsokqwspuml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM'
)

async function checkTransaction() {
  // From the log: KRP-250905-832
  const transactionId = 'KRP-250905-832'

  console.log('🔍 Checking transaction:', transactionId)

  const { data: transaction, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .single()

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log('\n📦 Transaction found:')
  console.log('ID:', transaction.id)
  console.log('Customer:', transaction.customer_name)
  console.log('Total:', transaction.total)
  console.log('\n📋 Items:')

  if (Array.isArray(transaction.items)) {
    transaction.items.forEach((item, i) => {
      console.log(`\n${i + 1}. ${item.productName || 'Unknown'}`)
      console.log(`   Product ID: ${item.productId}`)
      console.log(`   Quantity: ${item.quantity}`)
      console.log(`   Unit: ${item.unit}`)
      console.log(`   Price: ${item.price}`)
    })
  }

  // Check if any product IDs are invalid
  const invalidProductId = '649057d6-8e2f-408a-b079-417dd660cbc1'
  const hasInvalid = transaction.items?.some(item => item.productId === invalidProductId)

  if (hasInvalid) {
    console.log('\n⚠️  This transaction has invalid product ID!')
    console.log('Invalid ID:', invalidProductId)
  } else {
    console.log('\n✅ All product IDs look valid')
  }
}

checkTransaction()
