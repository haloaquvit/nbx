import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Notification } from '@/types/assets';

// Fetch all notifications for current user
export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50); // Limit to recent 50 notifications

      if (error) throw error;

      return (data || []).map((notif: any) => ({
        id: notif.id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        referenceType: notif.reference_type,
        referenceId: notif.reference_id,
        referenceUrl: notif.reference_url,
        priority: notif.priority,
        isRead: notif.is_read,
        readAt: notif.read_at ? new Date(notif.read_at) : undefined,
        userId: notif.user_id,
        createdAt: new Date(notif.created_at),
        expiresAt: notif.expires_at ? new Date(notif.expires_at) : undefined,
      })) as Notification[];
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!userId,
  });
}

// Get unread count
export function useUnreadNotificationsCount(userId?: string) {
  return useQuery({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!userId,
  });
}

// Mark notification as read
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Mark all notifications as read
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId?: string) => {
      let query = supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('is_read', false);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Delete notification
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Create manual notification
export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notification: Partial<Notification>) => {
      const id = `NOTIF-MANUAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { error } = await supabase
        .from('notifications')
        .insert({
          id,
          title: notification.title,
          message: notification.message,
          type: notification.type || 'other',
          reference_type: notification.referenceType,
          reference_id: notification.referenceId,
          reference_url: notification.referenceUrl,
          priority: notification.priority || 'normal',
          user_id: notification.userId,
        });

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Real-time subscription to notifications
export function useNotificationsSubscription(userId?: string, onNewNotification?: (notification: Notification) => void) {
  const queryClient = useQueryClient();

  // Subscribe to real-time changes
  const subscription = supabase
    .channel('notifications-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: userId ? `user_id=eq.${userId}` : undefined,
      },
      (payload) => {
        const newNotif = payload.new as any;
        const notification: Notification = {
          id: newNotif.id,
          title: newNotif.title,
          message: newNotif.message,
          type: newNotif.type,
          referenceType: newNotif.reference_type,
          referenceId: newNotif.reference_id,
          referenceUrl: newNotif.reference_url,
          priority: newNotif.priority,
          isRead: newNotif.is_read,
          readAt: newNotif.read_at ? new Date(newNotif.read_at) : undefined,
          userId: newNotif.user_id,
          createdAt: new Date(newNotif.created_at),
          expiresAt: newNotif.expires_at ? new Date(newNotif.expires_at) : undefined,
        };

        // Call callback if provided
        if (onNewNotification) {
          onNewNotification(notification);
        }

        // Invalidate queries to refresh
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    )
    .subscribe();

  return subscription;
}
