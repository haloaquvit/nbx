import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://emfvoassfrsokqwspuml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM'
)

async function checkProduct() {
  const productId = '649057d6-8e2f-408a-b079-417dd660cbc1'

  console.log('🔍 Checking product:', productId)

  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log('✅ Product found:', product)
  }

  // Also check all products
  const { data: allProducts, error: allError } = await supabase
    .from('products')
    .select('id, name')
    .limit(10)

  if (allError) {
    console.error('❌ Error getting products:', allError)
  } else {
    console.log('📦 Sample products:', allProducts)
  }
}

checkProduct()
