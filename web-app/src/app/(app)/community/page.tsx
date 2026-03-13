'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LeaderboardWidget from '@/components/community/LeaderboardWidget';
import { getToken } from '@/lib/auth-token';
import { Card } from '@/components/ui/Card';

export default function CommunityPage() {
    const router = useRouter();

    useEffect(() => {
        const token = getToken();
        if (!token) {
            router.push('/auth/login');
        }
    }, [router]);

    return (
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Community</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    See who is focusing the most and stay motivated!
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <LeaderboardWidget />

                <div className="rounded-xl p-6 text-white bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/20">
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                        Weekly Challenge <span>🎯</span>
                    </h3>
                    <p className="text-sm opacity-90 mb-5">
                        Focus for at least <strong>10 hours</strong> this week to earn the &quot;Week Warrior&quot; badge.
                    </p>
                    <Card variant="glass" padding="sm">
                        <div className="text-xs font-medium opacity-70 mb-1 uppercase tracking-wide">Your Progress</div>
                        <div className="text-xl font-bold text-white">Coming Soon</div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
