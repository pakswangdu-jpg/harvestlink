import { motion } from 'framer-motion';
import { Boxes, Eye, ShoppingBag, TriangleAlert } from 'lucide-react';

const CARDS = [
  { key: 'total', label: 'Total Products', icon: ShoppingBag },
  { key: 'active', label: 'Active Listings', icon: Eye },
  { key: 'lowStock', label: 'Low Stock', icon: TriangleAlert },
  { key: 'totalInventory', label: 'Total Inventory', icon: Boxes },
];

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function SummaryCards({ summary }) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.06 }}
    >
      {CARDS.map(({ key, label, icon: Icon }) => (
        <motion.div
          key={key}
          variants={cardVariants}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
            <Icon size={20} strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-gray-500">{label}</span>
            <span className="block text-[22px] font-semibold text-gray-900">{summary[key]}</span>
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
}
