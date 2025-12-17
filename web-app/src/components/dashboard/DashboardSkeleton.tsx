import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardSkeleton() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header Skeleton */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <Skeleton className="h-8 w-32" />
                    <div className="flex gap-4">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                </div>
            </div>

            <main className="container mx-auto px-4 py-8">
                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Main Focus Timer Skeleton */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 sm:p-12 text-center relative overflow-hidden">
                            <div className="flex justify-center mb-8">
                                <Skeleton className="h-10 w-64" />
                            </div>
                            <div className="relative w-72 h-72 mx-auto mb-8 flex items-center justify-center">
                                <Skeleton className="w-full h-full rounded-full" />
                            </div>
                            <div className="flex justify-center gap-4">
                                <Skeleton className="h-12 w-32 rounded-lg" />
                            </div>
                        </div>

                        {/* Today's Sessions Skeleton */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                            <Skeleton className="h-7 w-48 mb-6" />
                            <div className="space-y-3">
                                {[1, 2].map((i) => (
                                    <div key={i} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                        <div className="space-y-2">
                                            <Skeleton className="h-5 w-32" />
                                            <Skeleton className="h-4 w-24" />
                                        </div>
                                        <div className="space-y-2 flex flex-col items-end">
                                            <Skeleton className="h-6 w-16" />
                                            <Skeleton className="h-4 w-20" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Stats Sidebar Skeleton */}
                    <div className="space-y-6">
                        {/* Goals Widget Skeleton */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                            <div className="flex justify-between mb-4">
                                <Skeleton className="h-6 w-24" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                            <Skeleton className="h-8 w-16 mb-2" />
                            <Skeleton className="h-3 w-full rounded-full" />
                        </div>

                        {/* Gamification Skeleton */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                            <div className="flex justify-between mb-4">
                                <div className="space-y-1">
                                    <Skeleton className="h-6 w-20" />
                                    <Skeleton className="h-4 w-24" />
                                </div>
                                <Skeleton className="h-8 w-8" />
                            </div>
                            <Skeleton className="h-2.5 w-full rounded-full mb-6" />
                            <div className="grid grid-cols-5 gap-2">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <Skeleton key={i} className="aspect-square rounded-lg" />
                                ))}
                            </div>
                        </div>

                        {/* Stats Cards Skeleton */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-4">
                            <Skeleton className="h-6 w-32 mb-4" />
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="pt-4 first:pt-0 border-t dark:border-gray-700 first:border-0">
                                    <Skeleton className="h-8 w-24 mb-1" />
                                    <Skeleton className="h-4 w-32" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
