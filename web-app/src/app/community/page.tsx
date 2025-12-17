'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import LeaderboardWidget from '@/components/community/LeaderboardWidget';

export default function CommunityPage() {
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/auth/login');
        }
    }, [router]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <Header />

            <main className="container mx-auto px-4 py-8">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Community
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        See who is focusing the most and stay motivated!
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    <div>
                        <LeaderboardWidget />
                    </div>
                    <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl shadow-lg p-6 text-white">
                        <h3 className="text-xl font-bold mb-4">Weekly Challenge 🎯</h3>
                        <p className="mb-4">
                            Focus for at least <strong>10 hours</strong> this week to earn the "Week Warrior" badge.
                        </p>
                        <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                            <div className="text-sm opacity-80 mb-1">Your Progress</div>
                            <div className="text-2xl font-bold">Coming Soon</div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
