'use client';

import { useState, useEffect } from 'react';
import { getToken, getUserData } from '@/lib/auth-token';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function NotificationManager() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            // Register service worker
            navigator.serviceWorker.register('/sw.js').then(reg => {
                console.log('Service Worker registered', reg);
                setRegistration(reg);
                reg.pushManager.getSubscription().then(sub => {
                    if (sub) {
                        setSubscription(sub);
                        setIsSubscribed(true);
                    }
                });
            });
        }
    }, []);

    const subscribeToPush = async () => {
        if (!registration || !VAPID_PUBLIC_KEY) return;

        try {
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            console.log('Push Subscription:', JSON.stringify(sub));
            setSubscription(sub);
            setIsSubscribed(true);

            // Save to backend
            const token = getToken();
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(sub)
            });
            alert('Subscribed successfully!');
        } catch (error) {
            console.error('Failed to subscribe:', error);
            alert('Failed to subscribe to notifications.');
        }
    };

    const testPush = async () => {
        const token = getToken();
        // For demo purposes, we get the current user ID properly in the real app,
        // here we just trigger the send endpoint which checks the token.
        // The backend send/route.ts expects { title, body, userId }
        // Ideally we would trigger this via a server action or event, 
        // but for this button we need the userID.
        // Let's rely on the backend to figure out target or just not pass userId if self-send
        // Wait, the send API logic in route.ts requires userId to match targetUserId.
        // We need to fetch the user profile to get the ID.

        // Quick fix: decode token or fetch user me
        const user = getUserData() || {};

        await fetch('/api/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: 'FlowShield Test',
                body: 'This is a test notification from FlowShield!',
                userId: user.id
            })
        });
    };

    if (!isSubscribed) {
        return (
            <button
                onClick={subscribeToPush}
                className="text-sm bg-primary-100 hover:bg-primary-200 text-primary-700 py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
            >
                <span>🔔</span> Get Notifications
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 py-2 px-4 rounded-lg">
            <span>🔔</span> Notifications Active
            <button onClick={testPush} className="ml-2 text-xs underline text-green-700">Test</button>
        </div>
    );
}
