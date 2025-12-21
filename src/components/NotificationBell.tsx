import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, useUnreadNotificationsCount, useMarkNotificationAsRead, useMarkAllNotificationsAsRead } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: notifications = [], refetch } = useNotifications(userId);
  const { data: unreadCount = 0 } = useUnreadNotificationsCount(userId);
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();

  const handleNotificationClick = (notification: any) => {
    // Mark as read
    if (!notification.isRead) {
      markAsRead.mutate(notification.id);
    }

    // Navigate to reference URL if exists
    if (notification.referenceUrl) {
      navigate(notification.referenceUrl);
    }
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate(userId);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 border-red-300';
      case 'high':
        return 'bg-orange-100 border-orange-300';
      case 'normal':
        return 'bg-blue-100 border-blue-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'maintenance_due':
      case 'maintenance_overdue':
        return '🔧';
      case 'purchase_order_created':
        return '📦';
      case 'production_completed':
        return '🏭';
      case 'payroll_processed':
        return '💰';
      case 'debt_payment':
        return '💳';
      case 'low_stock':
        return '⚠️';
      case 'delivery_scheduled':
        return '🚚';
      default:
        return '📌';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifikasi</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={handleMarkAllAsRead}
            >
              Tandai semua dibaca
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-12 w-12 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Tidak ada notifikasi</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start p-3 cursor-pointer ${
                  !notification.isRead ? 'bg-blue-50' : ''
                } border-b last:border-b-0`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start w-full gap-2">
                  <span className="text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <div className="h-2 w-2 bg-blue-600 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-1">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(notification.createdAt, {
                          addSuffix: true,
                          locale: localeId,
                        })}
                      </span>
                      {notification.priority !== 'normal' && (
                        <Badge
                          variant="outline"
                          className={`text-xs px-1.5 py-0 ${getPriorityColor(
                            notification.priority
                          )}`}
                        >
                          {notification.priority === 'urgent'
                            ? 'Mendesak'
                            : notification.priority === 'high'
                            ? 'Penting'
                            : notification.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-center justify-center text-sm text-blue-600 cursor-pointer"
              onClick={() => navigate('/notifications')}
            >
              Lihat semua notifikasi
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
