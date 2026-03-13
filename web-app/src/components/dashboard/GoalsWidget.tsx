'use client';

import { useState, useEffect } from 'react';
import { getToken } from '@/lib/auth-token';

interface Goal {
    id: string;
    targetValue: number;
    currentValue: number;
    goalType: string;
}

interface GoalsWidgetProps {
    currentMinutes: number;
    onGoalUpdate?: () => void;
}

export default function GoalsWidget({ currentMinutes, onGoalUpdate }: GoalsWidgetProps) {
    const [goal, setGoal] = useState<Goal | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [targetInput, setTargetInput] = useState('240'); // Default 4 hours

    useEffect(() => {
        fetchGoal();
    }, []);

    const fetchGoal = async () => {
        try {
            const token = getToken();
            if (!token) return;

            const response = await fetch('/api/goals?type=DAILY_TIME', {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.goals && data.goals.length > 0) {
                    setGoal(data.goals[0]);
                    setTargetInput(data.goals[0].targetValue.toString());
                }
            }
        } catch (error) {
            console.error('Failed to fetch goal', error);
        } finally {
            setLoading(false);
        }
    };

    const saveGoal = async () => {
        try {
            const token = getToken();
            if (!token) return;

            const response = await fetch('/api/goals', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    type: 'DAILY_TIME',
                    targetValue: parseInt(targetInput),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setGoal(data.goal);
                setIsEditing(false);
                if (onGoalUpdate) onGoalUpdate();
            }
        } catch (error) {
            console.error('Failed to save goal', error);
        }
    };

    if (loading) return <div className="animate-pulse h-32 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>;

    const targetMinutes = goal ? goal.targetValue : 240;
    const progress = Math.min(100, (currentMinutes / targetMinutes) * 100);

    const formatTime = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Daily Goal 🎯
                </h3>
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                    {isEditing ? 'Cancel' : 'Edit Goal'}
                </button>
            </div>

            {isEditing ? (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                            Target (minutes)
                        </label>
                        <input
                            type="number"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                            {formatTime(parseInt(targetInput) || 0)}
                        </div>
                    </div>
                    <button
                        onClick={saveGoal}
                        className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        Save Goal
                    </button>
                </div>
            ) : (
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <div className="text-3xl font-bold text-gray-900 dark:text-white">
                                {Math.floor(progress)}%
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                {formatTime(currentMinutes)} / {formatTime(targetMinutes)}
                            </div>
                        </div>
                    </div>

                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-primary-600 h-3 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>

                    <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                        {progress >= 100
                            ? "🎉 Goal reached! Amazing focus today!"
                            : "Keep going! You're making progress."}
                    </div>
                </div>
            )}
        </div>
    );
}
