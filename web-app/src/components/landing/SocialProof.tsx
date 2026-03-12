const stats = [
  { value: '12,000+', label: 'Focused Users' },
  { value: '2.4M', label: 'Minutes Focused' },
  { value: '45,000+', label: 'Sessions Completed' },
  { value: '4.8/5', label: 'User Rating' },
];

export default function SocialProof() {
  return (
    <section className="bg-gray-800/50 border-y border-gray-700 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl md:text-4xl font-bold text-white">
                {stat.value}
              </div>
              <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
