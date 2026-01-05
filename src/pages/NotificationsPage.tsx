import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, useDeleteNotification } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow, format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
    Bell,
    Trash2,
    CheckCheck,
    Search,
    Filter,
    CheckCircle,
    AlertTriangle,
    Info
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function NotificationsPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    const { data: notifications = [], isLoading, refetch } = useNotifications(user?.id);
    const markAsRead = useMarkNotificationAsRead();
    const markAllAsRead = useMarkAllNotificationsAsRead();
    const deleteNotification = useDeleteNotification();

    const handleMarkAsRead = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        markAsRead.mutate(id);
    };

    const handleMarkAllAsRead = () => {
        markAllAsRead.mutate(user?.id);
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteNotification.mutate(id);
    };

    const handleClick = (notification: any) => {
        if (!notification.isRead) {
            markAsRead.mutate(notification.id);
        }

        if (notification.referenceUrl) {
            navigate(notification.referenceUrl);
        }
    };

    const filteredNotifications = notifications.filter((notif) => {
        const matchesSearch =
            notif.title.toLowerCase().includes(search.toLowerCase()) ||
            notif.message.toLowerCase().includes(search.toLowerCase());

        if (!matchesSearch) return false;

        if (filter === 'unread') return !notif.isRead;
        if (filter === 'read') return notif.isRead;
        if (filter === 'urgent') return notif.priority === 'urgent' || notif.priority === 'high';

        return true;
    });

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
            case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'normal': return 'bg-blue-100 text-blue-800 border-blue-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'maintenance_due': return <div className="p-2 bg-yellow-100 rounded-full text-yellow-600">🔧</div>;
            case 'low_stock': return <div className="p-2 bg-red-100 rounded-full text-red-600">⚠️</div>;
            case 'payment_due': return <div className="p-2 bg-orange-100 rounded-full text-orange-600">💰</div>;
            case 'success': return <div className="p-2 bg-green-100 rounded-full text-green-600">✅</div>;
            default: return <div className="p-2 bg-blue-100 rounded-full text-blue-600">📌</div>;
        }
    };

    return (
        <div className="container mx-auto py-6 max-w-5xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Notifikasi</h1>
                    <p className="text-muted-foreground">Pusat pemberitahuan dan aktivitas sistem</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleMarkAllAsRead} disabled={notifications.every(n => n.isRead)}>
                        <CheckCheck className="mr-2 h-4 w-4" />
                        Tandai Semua Dibaca
                    </Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari notifikasi..."
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-[180px]">
                        <Filter className="mr-2 h-4 w-4" />
                        <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua</SelectItem>
                        <SelectItem value="unread">Belum Dibaca</SelectItem>
                        <SelectItem value="read">Sudah Dibaca</SelectItem>
                        <SelectItem value="urgent">Penting / Mendesak</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8">Loading notifications...</div>
                ) : filteredNotifications.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                            <Bell className="h-12 w-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">Tidak ada notifikasi</p>
                            <p className="text-sm">Anda belum memiliki notifikasi pada kategori ini.</p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredNotifications.map((notif) => (
                        <Card
                            key={notif.id}
                            className={`transition-all hover:shadow-md cursor-pointer ${!notif.isRead ? 'border-blue-300 bg-blue-50/30' : ''}`}
                            onClick={() => handleClick(notif)}
                        >
                            <CardContent className="p-4 flex items-start gap-4">
                                <div className="flex-shrink-0 mt-1">
                                    {getIcon(notif.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className={`font-semibold text-base ${!notif.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                                            {notif.title}
                                        </h4>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {format(notif.createdAt, 'dd MMM yyyy HH:mm', { locale: localeId })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1 mb-2">
                                        {notif.message}
                                    </p>
                                    <div className="flex items-center gap-2 justify-between mt-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`${getPriorityColor(notif.priority)} border-0`}>
                                                {notif.priority.toUpperCase()}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(notif.createdAt, { addSuffix: true, locale: localeId })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {!notif.isRead && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                                                    onClick={(e) => handleMarkAsRead(notif.id, e)}
                                                    title="Tandai dibaca"
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    <span className="text-xs">Baca</span>
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                                onClick={(e) => handleDelete(notif.id, e)}
                                                title="Hapus"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
