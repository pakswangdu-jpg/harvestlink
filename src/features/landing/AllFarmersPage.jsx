import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import FarmersStatsRow from '../../components/farmers/FarmersStatsRow';
import FarmersSearchBar from '../../components/farmers/FarmersSearchBar';
import FarmersGrid from '../../components/farmers/FarmersGrid';
import FarmersPagination from '../../components/farmers/FarmersPagination';
import BrandWordmark from '../../components/common/BrandWordmark';
import { getAllVerifiedFarmers } from '../../services/authService';
import logo from '../../assets/logo.png';

const PAGE_SIZE = 12;

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Farmers', to: '/farmers' },
  { label: 'About', to: '/#about' },
  { label: 'Contact', to: '/#contact' },
];

function sortFarmers(farmers, sort) {
  const sorted = [...farmers];
  if (sort === 'most-orders') return sorted.sort((a, b) => b.completedOrders - a.completedOrders);
  if (sort === 'newest') return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sort === 'name') return sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted.sort((a, b) => b.avgRating - a.avgRating || b.completedOrders - a.completedOrders || b.ratingCount - a.ratingCount);
}

// Public, no login required — reached via the landing page's "View All Farmers" button.
// A dedicated, more premium chrome than PublicFarmerProfile.jsx's shared nav — this page
// gets its own sticky/blurred header rather than reusing the legacy .landing-nav classes.
export default function AllFarmersPage() {
  const [farmers, setFarmers] = useState(null);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState('top-rated');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getAllVerifiedFarmers()
      .then((result) => { if (!cancelled) setFarmers(result); })
      .catch(() => { if (!cancelled) setFarmers([]); });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = farmers === null;

  const availableCategories = useMemo(() => {
    if (!farmers) return [];
    return [...new Set(farmers.flatMap((farmer) => farmer.categories || []))].sort();
  }, [farmers]);

  const stats = useMemo(() => {
    if (!farmers || !farmers.length) return { farmerCount: 0, averageRating: 0, productCount: 0, cityCount: 0 };
    const ratedFarmers = farmers.filter((farmer) => farmer.ratingCount > 0);
    const weightedTotal = ratedFarmers.reduce((sum, farmer) => sum + farmer.avgRating * farmer.ratingCount, 0);
    const weightedCount = ratedFarmers.reduce((sum, farmer) => sum + farmer.ratingCount, 0);
    return {
      farmerCount: farmers.length,
      averageRating: weightedCount ? weightedTotal / weightedCount : 0,
      productCount: farmers.reduce((sum, farmer) => sum + (farmer.productCount || 0), 0),
      cityCount: new Set(farmers.map((farmer) => farmer.municipality).filter(Boolean)).size,
    };
  }, [farmers]);

  const filteredFarmers = useMemo(() => {
    if (!farmers) return [];
    const query = search.trim().toLowerCase();
    const filtered = farmers.filter((farmer) => {
      const matchesQuery = !query || [farmer.name, farmer.farmName, farmer.municipality]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
      const matchesLocation = !location || farmer.municipality === location;
      const matchesCategories = !selectedCategories.length
        || selectedCategories.some((category) => farmer.categories?.includes(category));
      return matchesQuery && matchesLocation && matchesCategories;
    });
    return sortFarmers(filtered, sort);
  }, [farmers, search, location, selectedCategories, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredFarmers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedFarmers = filteredFarmers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetAndSet = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setLocation('');
    setSelectedCategories([]);
    setPage(1);
  };

  const toggleCategory = (category) => {
    setSelectedCategories((current) => (
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    ));
    setPage(1);
  };

  return (
    <main className="min-h-screen bg-[var(--soft)]">
      <header className="sticky top-0 z-30 h-[72px] border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur supports-[backdrop-filter]:bg-[var(--panel)]/75">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-8 lg:px-16">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
            <span className="truncate text-[15px] font-bold text-[var(--text)]"><BrandWordmark /></span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.to}
                className="text-[13.5px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--green-800)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <Link to="/login" className="text-[13.5px] font-semibold text-[var(--text)] transition-colors hover:text-[var(--green-800)]">
              Login
            </Link>
            <Link
              to="/register"
              className="flex h-9 items-center rounded-lg bg-[var(--green-800)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--green-700)]"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-8 pt-20 pb-6 text-center lg:px-16">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--green-700)]"
        >
          Trusted Farmers
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mx-auto mt-3 text-[2.25rem] font-bold tracking-tight text-[var(--text)] sm:text-[3rem]"
        >
          Verified Farmers Across Cebu
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mx-auto mt-4 max-w-[650px] text-[15.5px] leading-7 text-[var(--muted)]"
        >
          Discover trusted local farmers, compare ratings, explore their products, and connect directly without middlemen.
        </motion.p>
      </section>

      <section className="mx-auto max-w-[1440px] px-8 pb-14 lg:px-16">
        <FarmersStatsRow
          farmerCount={stats.farmerCount}
          averageRating={stats.averageRating}
          productCount={stats.productCount}
          cityCount={stats.cityCount}
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-8 pb-24 lg:px-16">
        <FarmersSearchBar
          search={search}
          onSearchChange={resetAndSet(setSearch)}
          location={location}
          onLocationChange={resetAndSet(setLocation)}
          sort={sort}
          onSortChange={setSort}
          categories={availableCategories}
          selectedCategories={selectedCategories}
          onToggleCategory={toggleCategory}
          onClearCategories={() => { setSelectedCategories([]); setPage(1); }}
        />

        <div className="mt-10">
          <FarmersGrid farmers={pagedFarmers} isLoading={isLoading} onClearFilters={handleClearFilters} />
        </div>

        <FarmersPagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
      </section>
    </main>
  );
}
