import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, useUnreadNotificationsCount, useMarkNotificationAsRead, useMarkAllNotificationsAsRead } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

export function MobileNotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const [isOpen, setIsOpen] = useState(false);

  const { data: notifications = [], refetch } = useNotifications(userId);
  const { data: unreadCount = 0 } = useUnreadNotificationsCount(userId);
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();

  const handleNotificationClick = (notification: any) => {
    // Mark as read
    if (!notification.isRead) {
      markAsRead.mutate(notification.id);
    }

    // Close sheet and navigate
    setIsOpen(false);
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
        return 'bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-700';
      case 'high':
        return 'bg-orange-100 border-orange-300 dark:bg-orange-900/30 dark:border-orange-700';
      case 'normal':
        return 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700';
      default:
        return 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600';
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
      case 'transaction_created':
        return '🛒';
      default:
        return '📌';
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10">
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
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-96 p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">Notifikasi</SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-blue-600"
                onClick={handleMarkAllAsRead}
              >
                Tandai semua dibaca
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada notifikasi</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 cursor-pointer active:bg-gray-100 dark:active:bg-gray-800 ${
                    !notification.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm truncate dark:text-white">
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <div className="h-2 w-2 bg-blue-600 rounded-full flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
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
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
