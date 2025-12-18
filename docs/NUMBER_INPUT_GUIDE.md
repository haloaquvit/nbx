# Number Input Guide

Panduan penggunaan komponen NumberInput yang mendukung delete sampai kosong.

## Masalah dengan Input type="number"

Input HTML dengan `type="number"` memiliki keterbatasan:
- Tidak bisa di-backspace sampai kosong (akan berhenti di 0)
- Tidak bisa dikontrol formatnya dengan baik
- Browser behavior berbeda-beda

## Solusi: NumberInput Component

Komponen `NumberInput` adalah alternatif yang lebih baik dengan fitur:
- ✅ Bisa delete sampai kosong
- ✅ Kontrol min/max yang lebih baik
- ✅ Support desimal dengan presisi custom
- ✅ Allow empty state
- ✅ Format otomatis saat blur
- ✅ Support angka negatif (optional)

## Cara Menggunakan

### 1. Import Component

```tsx
import { NumberInput } from "@/components/ui/number-input"
```

### 2. Basic Usage

```tsx
function MyComponent() {
  const [price, setPrice] = useState<number | undefined>()

  return (
    <NumberInput
      value={price}
      onChange={setPrice}
      placeholder="Masukkan harga"
    />
  )
}
```

### 3. Dengan Min/Max

```tsx
<NumberInput
  value={quantity}
  onChange={setQuantity}
  min={0}
  max={1000}
  placeholder="Jumlah"
/>
```

### 4. Integer Only (Tidak Ada Desimal)

```tsx
<NumberInput
  value={qty}
  onChange={setQty}
  decimalPlaces={0}
  step={1}
  placeholder="Quantity"
/>
```

### 5. Harga dengan 2 Desimal

```tsx
<NumberInput
  value={unitPrice}
  onChange={setUnitPrice}
  decimalPlaces={2}
  min={0}
  placeholder="Rp 0.00"
/>
```

### 6. Tidak Boleh Kosong (Must Have Value)

```tsx
<NumberInput
  value={requiredQty}
  onChange={setRequiredQty}
  allowEmpty={false}  // Akan default ke 0 atau min saat blur jika kosong
  min={1}
  placeholder="Min 1"
/>
```

### 7. Allow Negative Numbers

```tsx
<NumberInput
  value={adjustment}
  onChange={setAdjustment}
  allowNegative={true}
  placeholder="Adjustment (bisa negatif)"
/>
```

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number \| undefined` | - | Nilai input |
| `onChange` | `(value: number \| undefined) => void` | - | Callback saat nilai berubah |
| `min` | `number` | - | Nilai minimum |
| `max` | `number` | - | Nilai maximum |
| `step` | `number` | `1` | Increment step |
| `allowEmpty` | `boolean` | `true` | Boleh kosong atau tidak |
| `allowNegative` | `boolean` | `false` | Boleh angka negatif |
| `decimalPlaces` | `number` | `2` | Jumlah desimal saat format |
| `placeholder` | `string` | - | Placeholder text |
| `disabled` | `boolean` | - | Disabled state |
| `className` | `string` | - | CSS class tambahan |

## Behavior Details

### Empty State
- Ketika user delete semua angka → value menjadi `undefined`
- Jika `allowEmpty={false}` → saat blur akan set ke `min` atau `0`

### Formatting
- Saat user mengetik: input bebas (bisa "12." atau "0.5")
- Saat blur: format otomatis ke decimal places yang ditentukan

### Min/Max Enforcement
- Saat onChange: jika < min → set ke min, jika > max → set ke max
- Saat blur: apply min/max dan format

## Migrasi dari Input type="number"

### Sebelum (Bermasalah):
```tsx
<Input
  type="number"
  value={quantity}
  onChange={(e) => setQuantity(Number(e.target.value))}
  min={0}
/>
```

❌ Masalah:
- Tidak bisa delete sampai kosong
- `e.target.value` bisa jadi string kosong
- Browser validation tidak konsisten

### Sesudah (Fixed):
```tsx
<NumberInput
  value={quantity}
  onChange={setQuantity}
  min={0}
/>
```

✅ Kelebihan:
- Bisa delete sampai kosong
- Type-safe (number | undefined)
- Consistent behavior

## Use Cases di Aplikasi

### 1. Purchase Order - Quantity & Price
```tsx
<NumberInput
  value={item.quantity}
  onChange={(value) => updateItem(item.id, 'quantity', value)}
  min={1}
  decimalPlaces={0}
  placeholder="Qty"
/>

<NumberInput
  value={item.unitPrice}
  onChange={(value) => updateItem(item.id, 'unitPrice', value)}
  min={0}
  decimalPlaces={2}
  placeholder="Rp 0.00"
/>
```

### 2. Stock Adjustment
```tsx
<NumberInput
  value={adjustment}
  onChange={setAdjustment}
  allowNegative={true}
  decimalPlaces={0}
  placeholder="+ atau - stock"
/>
```

### 3. Payment Amount
```tsx
<NumberInput
  value={paymentAmount}
  onChange={setPaymentAmount}
  min={0}
  max={totalDue}
  decimalPlaces={2}
  allowEmpty={false}
  placeholder={`Max: ${totalDue}`}
/>
```

## Tips & Best Practices

1. **Selalu gunakan NumberInput daripada Input type="number"**
   - Lebih predictable
   - Better UX

2. **Set `allowEmpty` berdasarkan context**
   - Form input biasa: `allowEmpty={true}` (default)
   - Required field: `allowEmpty={false}`

3. **Set `decimalPlaces` sesuai kebutuhan**
   - Quantity: `decimalPlaces={0}`
   - Price: `decimalPlaces={2}`
   - Scientific: `decimalPlaces={4}`

4. **Jangan set min/max terlalu ketat saat input**
   - Biarkan user bebas input
   - Validasi saat blur atau submit

5. **Handle undefined di onChange**
   ```tsx
   onChange={(value) => {
     if (value === undefined) {
       // Handle empty case
       setItem({ ...item, quantity: undefined })
     } else {
       setItem({ ...item, quantity: value })
     }
   }}
   ```

## Troubleshooting

### Q: Input masih berhenti di 0?
A: Pastikan menggunakan `NumberInput` bukan `Input type="number"`

### Q: Value jadi NaN?
A: Cek apakah handle `undefined` dengan benar di onChange

### Q: Format tidak apply?
A: Format hanya apply saat blur, bukan saat typing

### Q: Min/max tidak work?
A: Cek apakah min/max di-pass sebagai number, bukan string
