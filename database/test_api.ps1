# Test PostgREST API after RLS fix
$ErrorActionPreference = "Stop"

# Login sebagai owner
$loginResponse = Invoke-RestMethod -Uri 'https://erp.aquvit.id/auth/v1/token?grant_type=password' -Method POST -ContentType 'application/json' -Body '{"email":"inputpip@gmail.com","password":"Sukses098"}'
$token = $loginResponse.access_token
Write-Host "Login as: $($loginResponse.user.email) Role: $($loginResponse.user.role)"

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type' = 'application/json'
}

# Get customer and product for test transaction
$customer = Invoke-RestMethod -Uri 'https://erp.aquvit.id/rest/v1/customers?select=id,name&limit=1' -Method GET -Headers $headers
$product = Invoke-RestMethod -Uri 'https://erp.aquvit.id/rest/v1/products?select=id,name,selling_price&limit=1' -Method GET -Headers $headers
$branch = Invoke-RestMethod -Uri 'https://erp.aquvit.id/rest/v1/branches?select=id,name&limit=1' -Method GET -Headers $headers

Write-Host "Customer: $($customer[0].name)"
Write-Host "Product: $($product[0].name) Price: $($product[0].selling_price)"
Write-Host "Branch: $($branch[0].name)"

# Test POST transaction
$transactionData = @{
    customer_id = $customer[0].id
    customer_name = $customer[0].name
    cashier_id = '539af32c-4388-4d62-9997-82d016eb6e52'
    cashier_name = 'Owner Test'
    order_date = (Get-Date).ToString('yyyy-MM-dd')
    items = @(@{
        product_id = $product[0].id
        product_name = $product[0].name
        quantity = 1
        price = $product[0].selling_price
        subtotal = $product[0].selling_price
    })
    total = $product[0].selling_price
    paid_amount = 0
    payment_status = 'unpaid'
    status = 'pending'
    branch_id = $branch[0].id
} | ConvertTo-Json -Depth 5

Write-Host "Transaction data:"
Write-Host $transactionData

$postHeaders = @{
    'Authorization' = "Bearer $token"
    'Content-Type' = 'application/json'
    'Prefer' = 'return=representation'
}

try {
    $response = Invoke-WebRequest -Uri 'https://erp.aquvit.id/rest/v1/transactions?select=*' -Method POST -Headers $postHeaders -Body $transactionData
    Write-Host "POST transaction: SUCCESS - Status: $($response.StatusCode)"
    $created = $response.Content | ConvertFrom-Json
    Write-Host "Created transaction ID: $($created[0].id)"
} catch {
    Write-Host "POST transaction: ERROR - $($_.Exception.Response.StatusCode)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host $reader.ReadToEnd()
}
