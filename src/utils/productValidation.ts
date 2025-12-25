import { supabase } from '@/integrations/supabase/client';
import { ProductType } from '@/types/product';

/**
 * Check if a Produksi product has BOM materials
 */
export const checkProductHasBOM = async (productId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('product_materials')
      .select('id')
      .eq('product_id', productId)
      .limit(1);

    if (error) {
      console.error('Error checking BOM:', error);
      return false;
    }

    return (data && data.length > 0);
  } catch (error) {
    console.error('Error in checkProductHasBOM:', error);
    return false;
  }
};

/**
 * Validate if a Produksi product can be used for production
 * Produksi products must have BOM, Jual Langsung products don't need BOM
 */
export const validateProductForProduction = async (
  productId: string, 
  productType: ProductType
): Promise<{ valid: boolean; message?: string }> => {
  if (productType === 'Jual Langsung') {
    return { 
      valid: false, 
      message: 'Produk "Jual Langsung" tidak dapat digunakan untuk produksi. Produk ini hanya untuk tracking penjualan.' 
    };
  }

  if (productType === 'Produksi') {
    const hasBOM = await checkProductHasBOM(productId);
    if (!hasBOM) {
      return { 
        valid: false, 
        message: 'Produk "Produksi" harus memiliki BOM (Bill of Materials) sebelum dapat diproduksi. Silakan tambahkan material terlebih dahulu.' 
      };
    }
  }

  return { valid: true };
};

/**
 * Handle different behaviors for product types during sales
 */
export const getProductSalesBehavior = (productType: ProductType) => {
  switch (productType) {
    case 'Produksi':
      return {
        trackStock: true,
        reduceStock: true,
        requiresBOM: true,
        description: 'Produksi: Stok berkurang saat delivery (atau langsung jika Laku Kantor)'
      };
    case 'Jual Langsung':
      return {
        trackStock: true,
        reduceStock: true,
        requiresBOM: false,
        description: 'Jual Langsung: Stok berkurang saat delivery (atau langsung jika Laku Kantor)'
      };
    default:
      return {
        trackStock: false,
        reduceStock: false,
        requiresBOM: false,
        description: 'Unknown product type'
      };
  }
};