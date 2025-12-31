import { supabase } from '@/integrations/supabase/client';

export interface LowStockItem {
  id: string;
  name: string;
  type: 'product' | 'material';
  currentStock: number;
  minStock: number;
  unit: string;
}

export interface LowStockCheckResult {
  lowStockProducts: LowStockItem[];
  lowStockMaterials: LowStockItem[];
  totalLowStock: number;
}

/**
 * Service for checking low stock items and creating notifications
 */
export const LowStockNotificationService = {
  /**
   * Check for products with stock below minimum
   */
  async checkLowStockProducts(branchId?: string): Promise<LowStockItem[]> {
    let query = supabase
      .from('products')
      .select('id, name, current_stock, min_stock, unit')
      .not('min_stock', 'is', null)
      .gt('min_stock', 0);

    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},is_shared.eq.true`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[LowStockNotificationService] Error fetching products:', error);
      return [];
    }

    // Filter products where current_stock <= min_stock
    return (data || [])
      .filter((p: any) => Number(p.current_stock || 0) <= Number(p.min_stock || 0))
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        type: 'product' as const,
        currentStock: Number(p.current_stock || 0),
        minStock: Number(p.min_stock || 0),
        unit: p.unit || 'pcs',
      }));
  },

  /**
   * Check for materials with stock below minimum (only Stock type)
   */
  async checkLowStockMaterials(branchId?: string): Promise<LowStockItem[]> {
    let query = supabase
      .from('materials')
      .select('id, name, stock, min_stock, unit, type')
      .eq('type', 'Stock')
      .not('min_stock', 'is', null)
      .gt('min_stock', 0);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[LowStockNotificationService] Error fetching materials:', error);
      return [];
    }

    // Filter materials where stock <= min_stock
    return (data || [])
      .filter((m: any) => Number(m.stock || 0) <= Number(m.min_stock || 0))
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        type: 'material' as const,
        currentStock: Number(m.stock || 0),
        minStock: Number(m.min_stock || 0),
        unit: m.unit || 'pcs',
      }));
  },

  /**
   * Check all low stock items (products + materials)
   */
  async checkAllLowStock(branchId?: string): Promise<LowStockCheckResult> {
    const [lowStockProducts, lowStockMaterials] = await Promise.all([
      this.checkLowStockProducts(branchId),
      this.checkLowStockMaterials(branchId),
    ]);

    return {
      lowStockProducts,
      lowStockMaterials,
      totalLowStock: lowStockProducts.length + lowStockMaterials.length,
    };
  },

  /**
   * Create low stock notification for owner/supervisor
   */
  async createLowStockNotification(
    items: LowStockItem[],
    targetUserIds: string[],
    branchId?: string
  ): Promise<void> {
    if (items.length === 0 || targetUserIds.length === 0) {
      return;
    }

    // Group by type
    const products = items.filter(i => i.type === 'product');
    const materials = items.filter(i => i.type === 'material');

    // Create message
    let message = '';
    if (products.length > 0) {
      message += `${products.length} produk stok rendah: ${products.slice(0, 3).map(p => p.name).join(', ')}`;
      if (products.length > 3) message += ` dan ${products.length - 3} lainnya`;
    }
    if (materials.length > 0) {
      if (message) message += '. ';
      message += `${materials.length} bahan stok rendah: ${materials.slice(0, 3).map(m => m.name).join(', ')}`;
      if (materials.length > 3) message += ` dan ${materials.length - 3} lainnya`;
    }

    // Determine priority
    const criticalCount = items.filter(i => i.currentStock <= i.minStock / 2).length;
    const priority = criticalCount > 0 ? 'high' : 'normal';

    // Create notification for each target user
    for (const userId of targetUserIds) {
      // Check if similar notification already exists (not read, created today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'low_stock')
        .eq('is_read', false)
        .gte('created_at', today.toISOString())
        .limit(1);

      if (existingNotif && existingNotif.length > 0) {
        // Update existing notification
        await supabase
          .from('notifications')
          .update({
            title: `Peringatan Stok Rendah (${items.length} item)`,
            message,
            priority,
            reference_id: branchId || null,
          })
          .eq('id', existingNotif[0].id);
      } else {
        // Create new notification - let database auto-generate UUID
        await supabase
          .from('notifications')
          .insert({
            title: `Peringatan Stok Rendah (${items.length} item)`,
            message,
            type: 'low_stock',
            reference_type: 'stock_report',
            reference_url: '/stock-report',
            priority,
            user_id: userId,
            reference_id: branchId || null,
          });
      }
    }

    console.log(`[LowStockNotificationService] Created notifications for ${targetUserIds.length} users`);
  },

  /**
   * Get user IDs for roles that should receive low stock notifications
   * (Owner, Supervisor, or anyone with stock_view permission)
   */
  async getNotificationTargetUsers(branchId?: string): Promise<string[]> {
    // Get profiles with owner/supervisor roles
    let query = supabase
      .from('profiles')
      .select('id, role')
      .or('role.ilike.%owner%,role.ilike.%supervisor%,role.ilike.%admin%');

    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[LowStockNotificationService] Error fetching target users:', error);
      return [];
    }

    return (data || []).map((u: any) => u.id);
  },

  /**
   * Run full low stock check and create notifications
   */
  async runLowStockCheck(branchId?: string): Promise<LowStockCheckResult> {
    console.log('[LowStockNotificationService] Running low stock check...');

    // Check all low stock items
    const result = await this.checkAllLowStock(branchId);

    if (result.totalLowStock > 0) {
      // Get target users
      const targetUsers = await this.getNotificationTargetUsers(branchId);

      // Create notifications
      const allItems = [...result.lowStockProducts, ...result.lowStockMaterials];
      await this.createLowStockNotification(allItems, targetUsers, branchId);

      console.log(`[LowStockNotificationService] Found ${result.totalLowStock} low stock items`);
    } else {
      console.log('[LowStockNotificationService] No low stock items found');
    }

    return result;
  },
};
